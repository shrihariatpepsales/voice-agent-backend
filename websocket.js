const WebSocket = require('ws');

const { createDeepgramStream } = require('./services/deepgram');
const { createOpenAIStream } = require('./services/openai');
const { createTTSStream } = require('./services/tts');
const { connectToDatabase } = require('./db');
const Session = require('./models/Session');
const ConversationEntry = require('./models/ConversationEntry');

function log(context, message, extra = {}) {
  const timestamp = new Date().toISOString();
  console.log(
    JSON.stringify({
      ts: timestamp,
      ctx: context,
      msg: message,
      ...extra,
    })
  );
}

function initWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    log('ws', 'client_connected');

    // Per-connection state
    let currentLLMStream = null;
    let currentTTSStream = null;
    let deepgramStream = null;
    let conversationHistory = [];
    let browserSessionId = null;
    let currentUserId = null;
    let isRecording = false;
    
    // Silence detection for transcript finalization
    // Use transcript-based detection instead of audio-chunk-based
    // Audio chunks can contain silence/noise, but transcripts only arrive when there's actual speech
    let lastTranscriptTime = null; // Track when last transcript was received
    let lastAudioChunkTime = null; // Keep for reference/debugging
    let silenceTimeout = null;
    let pendingTranscript = null;
    let lastFinalizedTranscript = null; // Track last finalized to prevent duplicates
    let lastSentTranscript = null; // Track last sent to UI to prevent duplicate sends
    let silenceCheckInterval = null; // Periodic check for silence
    let llmCallPending = false; // Flag to prevent multiple LLM calls from being triggered
    let receivedFinalTranscript = false; // Track if we've received Deepgram's final transcript
    const SILENCE_THRESHOLD_MS = 5000; // 5 seconds of silence (no new transcripts)
    const FINAL_TRANSCRIPT_BUFFER_MS = 1500; // Wait 1.5 seconds after silence to capture final transcript

    function sendMessage(type, payload) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
      }
    }

    async function resolveUserForBrowserSession(id) {
      try {
        await connectToDatabase();
        const session = await Session.findOne({ browserSessionId: id })
          .sort({ updatedAt: -1 })
          .lean()
          .exec();
        currentUserId = session && session.user ? session.user.toString() : null;
      } catch (error) {
        log('ws', 'error_resolving_session_user', {
          error: error.message,
          browserSessionId: id,
        });
        currentUserId = null;
      }
    }

    async function saveConversationTurn(userText, agentText, mode) {
      try {
        if (!browserSessionId) {
          // Nothing to persist without a browser session identifier
          return;
        }

        await connectToDatabase();

        await ConversationEntry.create({
          browserSessionId,
          user: currentUserId || null,
          mode,
          userText,
          agentText,
        });

        log('ws', 'conversation_turn_saved', {
          browserSessionId,
          hasUser: !!currentUserId,
          mode,
          userTextLength: userText.length,
          agentTextLength: agentText.length,
        });
      } catch (error) {
        log('ws', 'error_saving_conversation_turn', {
          error: error.message,
          browserSessionId,
        });
      }
    }

    /**
     * Process user message and make LLM call (used for both voice transcripts and chat messages)
     * @param {string} userMessage - The user's message text
     * @param {boolean} isChatMode - Whether this is from chat mode (affects status updates)
     */
    function processUserMessage(userMessage, isChatMode = false) {
      if (!userMessage || !userMessage.trim()) {
        log('ws', 'empty_user_message', { isChatMode });
        return;
      }

      const messageText = userMessage.trim();
      const userTimestamp = new Date().toISOString();
      
      log('ws', 'processing_user_message_for_llm', {
        messageLength: messageText.length,
        messagePreview: messageText.substring(0, 100),
        isChatMode
      });

      // Print "Make LLM call" to console
      console.log('\n========================================');
      console.log('🔔 Make LLM call');
      console.log(`📝 ${isChatMode ? 'Chat' : 'Transcript'}: ${messageText}`);
      console.log('========================================\n');

      // Add user message to conversation history
      conversationHistory.push({ role: 'user', content: messageText });

      // Update status to show we're thinking
      sendMessage('status', { state: 'thinking' });

      // Clear previous agent response in UI when new LLM call starts
      sendMessage('agent_text', { token: '', clear: true });

      // Cancel any in-flight LLM/TTS streams
      if (currentLLMStream && currentLLMStream.cancel) {
        currentLLMStream.cancel();
        currentLLMStream = null;
      }
      if (currentTTSStream && currentTTSStream.cancel) {
        currentTTSStream.cancel();
        currentTTSStream = null;
      }

      // Create OpenAI stream for LLM response
      let llmResponseText = '';
      currentLLMStream = createOpenAIStream({
        messages: conversationHistory,
        onToken: (token) => {
          // Stream tokens to frontend in real-time
          llmResponseText += token;
          sendMessage('agent_text', { token });
        },
        onComplete: async (fullResponse) => {
          llmResponseText = fullResponse;

          // Add assistant response to conversation history
          conversationHistory.push({ role: 'assistant', content: fullResponse });

          // Persist conversation turn to database (guest or logged-in)
          await saveConversationTurn(
            messageText,
            fullResponse,
            isChatMode ? 'chat' : 'voice'
          );

          // Send structured pair of user + agent messages so UI can render both bubbles
          try {
            const agentTimestamp = new Date().toISOString();
            sendMessage('conversation_turn', {
              mode: isChatMode ? 'chat' : 'voice',
              user: {
                text: messageText,
                timestamp: userTimestamp,
              },
              agent: {
                text: fullResponse,
                timestamp: agentTimestamp,
              },
            });
          } catch (err) {
            log('ws', 'conversation_turn_send_error', {
              error: err.message,
            });
          }

          // Update status based on mode
          if (isChatMode) {
            // In chat mode, skip 'speaking' status and go directly to 'idle'
            // (No TTS in chat mode)
            sendMessage('status', { state: 'idle' });
          } else {
            // In voice mode, set 'speaking' status for TTS indication
            // Frontend will handle TTS and update state accordingly
            sendMessage('status', { state: 'speaking' });
            // Set to idle to trigger frontend TTS
            sendMessage('status', { state: 'idle' });
          }

          // Log completion
          log('ws', 'llm_response_complete', {
            messageLength: messageText.length,
            responseLength: fullResponse.length,
            isChatMode
          });

          currentLLMStream = null;
        },
        onError: async (err) => {
          log('openai', 'llm_error', { error: err.message, isChatMode });

          // Persist error response as a conversation turn for debugging/traceability
          const errorResponse = `Error: ${err.message}`;
          await saveConversationTurn(
            messageText,
            errorResponse,
            isChatMode ? 'chat' : 'voice'
          );

          sendMessage('status', { state: 'error', error: 'llm_error' });
          currentLLMStream = null;
        },
      });

      log('ws', 'llm_call_initiated', {
        messageLength: messageText.length,
        conversationHistoryLength: conversationHistory.length,
        isChatMode
      });
    }

    function startDeepgramStream() {
      if (deepgramStream) {
        // Already started
        return;
      }

      // Reset silence detection state
      lastAudioChunkTime = null;
      lastTranscriptTime = null; // Reset transcript-based silence detection
      pendingTranscript = null;
      lastFinalizedTranscript = null;
      lastSentTranscript = null; // Reset last sent transcript
      llmCallPending = false; // Reset LLM call flag
      receivedFinalTranscript = false; // Reset final transcript flag
      clearSilenceDetection();

      // Start silence detection interval ONCE when recording starts
      // Don't restart it on every audio chunk - just update timestamp
      startSilenceDetection();

      log('ws', 'starting_deepgram_stream');
      deepgramStream = createDeepgramStream({
      onTranscript: ({ text, isFinal }) => {
        // Deepgram sends incremental transcripts - each new transcript extends or replaces the previous
        // CRITICAL: Do NOT reset silence timer here - only reset on audio chunks!
        // Transcripts can arrive even after audio stops, so resetting here would break silence detection
        if (text && text.trim().length > 0) {
          const trimmedText = text.trim();
          
          // Track if this is a final transcript from Deepgram
          if (isFinal) {
            receivedFinalTranscript = true;
            log('ws', 'deepgram_final_transcript_received', {
              textLength: trimmedText.length,
              preview: trimmedText.substring(0, 80)
            });
          }
          
          // Deepgram sends FULL transcripts each time (both interim and final)
          // Each new transcript is the complete transcript up to that point
          // CRITICAL: Keep accumulating the longest transcript until 5 seconds of silence
          // Deepgram may send final transcripts for parts of a sentence
          // We want to capture the complete sentence by always using the longest transcript
          if (!pendingTranscript) {
            // First transcript
            pendingTranscript = trimmedText;
          } else {
            const existingLower = pendingTranscript.toLowerCase().trim();
            const newLower = trimmedText.toLowerCase().trim();
            
            // Check if new transcript extends or contains the existing one
            const newContainsExisting = newLower.includes(existingLower);
            const existingContainsNew = existingLower.includes(newLower);
            
            // Strategy: Always use the longest transcript that contains or extends the previous
            // If new transcript is longer and contains existing, use it (it's an extension)
            if (trimmedText.length > pendingTranscript.length && newContainsExisting) {
              pendingTranscript = trimmedText;
            }
            // If new transcript is longer (even if doesn't contain), use it (might be continuation)
            else if (trimmedText.length > pendingTranscript.length) {
              // Check if it's a continuation (doesn't overlap much)
              // If new transcript doesn't contain existing and existing doesn't contain new,
              // they might be separate segments - append them
              if (!newContainsExisting && !existingContainsNew) {
                // They're separate segments - append them
                pendingTranscript = (pendingTranscript + ' ' + trimmedText).trim();
                log('ws', 'appending_separate_segment', {
                  existingLength: pendingTranscript.length - trimmedText.length - 1,
                  newLength: trimmedText.length,
                  combinedLength: pendingTranscript.length
                });
              } else {
                // Use the longer one
                pendingTranscript = trimmedText;
              }
            }
            // If new transcript contains existing (even if same length), use it (might have corrections)
            else if (newContainsExisting && trimmedText.length >= pendingTranscript.length) {
              pendingTranscript = trimmedText;
            }
            // If existing contains new, keep existing (it's longer/more complete)
            else if (existingContainsNew && pendingTranscript.length > trimmedText.length) {
              // Keep existing - it's more complete
            }
            // If equal length but different, check if one contains the other
            else if (trimmedText.length === pendingTranscript.length && trimmedText !== pendingTranscript) {
              // Use new one if it contains existing, otherwise keep existing
              if (newContainsExisting) {
                pendingTranscript = trimmedText;
              }
            }
            // If shorter and doesn't overlap, might be a continuation - append it
            else if (trimmedText.length < pendingTranscript.length && !newContainsExisting && !existingContainsNew) {
              // Check if it's a continuation by checking if it starts differently
              const existingEnd = existingLower.substring(Math.max(0, existingLower.length - 10));
              const newStart = newLower.substring(0, Math.min(10, newLower.length));
              // If they don't overlap, append
              if (!existingEnd.includes(newStart) && !newStart.includes(existingEnd)) {
                pendingTranscript = (pendingTranscript + ' ' + trimmedText).trim();
                log('ws', 'appending_continuation', {
                  existingLength: pendingTranscript.length - trimmedText.length - 1,
                  newLength: trimmedText.length,
                  combinedLength: pendingTranscript.length
                });
              }
            }
            // Otherwise keep existing (it's longer and more complete)
          }
          
          // Prevent sending duplicate transcripts to UI
          // Only send if transcript actually changed
          const currentTranscript = pendingTranscript.trim();
          if (currentTranscript && currentTranscript !== lastSentTranscript) {
            const previousLength = lastSentTranscript ? lastSentTranscript.length : 0;
            // Only treat as new utterance if:
            // 1. No previous transcript (first one)
            // 2. Transcript is significantly shorter AND doesn't contain previous text (likely new sentence)
            // 3. Transcript starts completely differently (doesn't start with previous text)
            const containsPrevious = lastSentTranscript && 
                                     currentTranscript.toLowerCase().includes(lastSentTranscript.toLowerCase().substring(0, Math.min(20, lastSentTranscript.length)));
            const startsDifferently = lastSentTranscript && 
                                       !currentTranscript.toLowerCase().startsWith(lastSentTranscript.toLowerCase().substring(0, Math.min(10, lastSentTranscript.length)));
            const isNewUtterance = !lastSentTranscript || 
                                   (currentTranscript.length < previousLength * 0.5 && !containsPrevious && startsDifferently); // Significant reduction + different content = new utterance
            
            lastSentTranscript = currentTranscript;
            
            // Reset transcript-based silence timer - new transcript means speaker is speaking
            // This is the key: transcripts only arrive when there's actual speech
            lastTranscriptTime = Date.now();
            
            // Only reset final transcript flag if this is a NEW utterance (not just an update)
            // Updates to the same utterance (longer transcripts) should NOT reset the flag
            if (isNewUtterance) {
              receivedFinalTranscript = false;
              log('ws', 'new_utterance_detected', {
                previousLength,
                currentLength: currentTranscript.length,
                preview: currentTranscript.substring(0, 50),
                reason: previousLength === 0 ? 'first_transcript' : 
                       (currentTranscript.length < previousLength * 0.5 && !containsPrevious && startsDifferently) ? 'significant_reduction_and_different' : 'unknown'
              });
            } else {
              // This is an update to the current utterance - update final flag if this is final
              if (isFinal) {
                receivedFinalTranscript = true;
                log('ws', 'final_transcript_received_update', {
                  transcriptLength: currentTranscript.length,
                  preview: currentTranscript.substring(0, 80)
                });
              }
            }
            
            // If a new transcript arrives while LLM call is pending
            if (llmCallPending) {
              // Only cancel if it's a NEW utterance (user started speaking again)
              // If it's just an update to the current utterance, let it continue updating
              if (isNewUtterance) {
                log('ws', 'llm_call_cancelled_new_utterance', {
                  newTranscriptLength: currentTranscript.length,
                  wasFinal: receivedFinalTranscript
                });
                llmCallPending = false;
                receivedFinalTranscript = false;
              } else {
                // Just an update to current utterance - update the final flag if this is final
                if (isFinal) {
                  receivedFinalTranscript = true;
                  log('ws', 'final_transcript_received_during_wait', {
                    transcriptLength: currentTranscript.length,
                    preview: currentTranscript.substring(0, 80)
                  });
                }
              }
            }
            
            // Log when transcript is updated (occasionally)
            if (Math.random() < 0.15) {
              log('ws', 'transcript_accumulated', { 
                length: currentTranscript.length,
                preview: currentTranscript.substring(0, 80),
                isFinalFromDeepgram: isFinal,
                transcriptTimeReset: true
              });
            }
            
            // Send accumulated transcript to frontend in real-time (as interim)
            // This allows UI to show the full transcript as it builds up
            sendMessage('transcript', { text: currentTranscript, isFinal: false });
          }
        }
      },
      onError: (err) => {
        log('deepgram', 'stt_error', { error: err.message });
        sendMessage('status', { state: 'error', error: 'stt_error' });
      },
    });
    }

    function clearSilenceDetection() {
      // Clear timeout-based detection
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
      }
      // Clear interval-based detection
      if (silenceCheckInterval) {
        clearInterval(silenceCheckInterval);
        silenceCheckInterval = null;
      }
    }

    function startSilenceDetection() {
      // Clear any existing detection mechanisms
      clearSilenceDetection();

      // Use transcript-based silence detection instead of audio-chunk-based
      // Transcripts only arrive when there's actual speech, so this is more accurate
      // Check every 100ms to detect 5 seconds of silence (no new transcripts)
      let checkCount = 0;
      silenceCheckInterval = setInterval(() => {
        checkCount++;
        
        // Only check if we have received at least one transcript
        if (!lastTranscriptTime) {
          // No transcripts received yet, don't check for silence
          if (checkCount % 50 === 0) {
            log('ws', 'silence_check_no_transcripts', { checkCount });
          }
          return;
        }

        const timeSinceLastTranscript = Date.now() - lastTranscriptTime;
        
        // Log every 10 seconds to verify interval is running
        if (checkCount % 100 === 0) {
          log('ws', 'silence_check_running', {
            timeSinceLastTranscript,
            timeSinceLastTranscriptSeconds: Math.round(timeSinceLastTranscript / 1000),
            hasPendingTranscript: !!pendingTranscript,
            pendingLength: pendingTranscript ? pendingTranscript.length : 0,
            thresholdSeconds: SILENCE_THRESHOLD_MS / 1000
          });
        }
        
        // Log when approaching threshold (every second when > 5 seconds)
        if (timeSinceLastTranscript >= 5000 && timeSinceLastTranscript < SILENCE_THRESHOLD_MS) {
          if (checkCount % 10 === 0) { // Every second
            log('ws', 'approaching_silence_threshold', {
              timeSinceLastTranscript,
              timeSinceLastTranscriptSeconds: Math.round(timeSinceLastTranscript / 1000),
              remainingSeconds: Math.round((SILENCE_THRESHOLD_MS - timeSinceLastTranscript) / 1000),
              hasPendingTranscript: !!pendingTranscript
            });
          }
        }
        
        // Only trigger LLM call if:
        // 1. Silence threshold reached (5 seconds)
        // 2. No LLM call already pending
        // 3. There's actually a transcript to process
        if (timeSinceLastTranscript >= SILENCE_THRESHOLD_MS && 
            !llmCallPending && 
            pendingTranscript && 
            pendingTranscript.trim().length > 0) {
          // 5 seconds (or more) have passed since last transcript - true silence detected
          // Set flag to prevent multiple triggers
          llmCallPending = true;
          
          log('ws', 'silence_threshold_reached', {
            msSinceLastTranscript: timeSinceLastTranscript,
            hasPendingTranscript: !!pendingTranscript,
            pendingText: pendingTranscript ? pendingTranscript.substring(0, 100) : null,
            pendingLength: pendingTranscript ? pendingTranscript.length : 0
          });
          
          // Store the transcript at the moment silence is detected
          // This prevents it from being reset before we process it
          const transcriptAtSilence = pendingTranscript.trim();
          
          // Wait a buffer to ensure we capture any final transcript from Deepgram
          // Deepgram may send final transcripts after silence is detected
          // We'll wait for either: Deepgram's final transcript OR the buffer timeout
          const checkForFinalTranscript = () => {
            // Use the most up-to-date transcript, but fall back to transcript at silence
            // This ensures we capture the complete transcript including final updates
            const transcriptToProcess = (pendingTranscript && pendingTranscript.trim().length > 0) 
              ? pendingTranscript.trim() 
              : transcriptAtSilence;
            
            // Only process if we have a valid transcript
            if (transcriptToProcess && transcriptToProcess.length > 0) {
              
              // Log what we're processing
              log('ws', 'processing_transcript_for_llm', {
                transcriptLength: transcriptToProcess.length,
                transcriptPreview: transcriptToProcess.substring(0, 100),
                receivedFinalFromDeepgram: receivedFinalTranscript
              });
              
              // Use the shared processUserMessage function for voice transcripts
            processUserMessage(transcriptToProcess, false);
            
            // Reset transcript immediately after LLM call is initiated
            // This ensures we start fresh for the next utterance
            pendingTranscript = null;
            lastSentTranscript = null;
            receivedFinalTranscript = false;
            
            // Reset flag to allow next LLM call immediately
            llmCallPending = false;
            } else {
              // No transcript to process - reset flag
              log('ws', 'no_transcript_to_process', {
                transcriptAtSilence: transcriptAtSilence ? transcriptAtSilence.substring(0, 50) : null,
                pendingTranscript: pendingTranscript ? pendingTranscript.substring(0, 50) : null
              });
              llmCallPending = false;
              receivedFinalTranscript = false;
            }
          };
          
          // Wait for Deepgram's final transcript before making LLM call
          // This ensures we capture the complete transcript including the last words
          // We'll wait up to 2 seconds after receiving a final transcript to ensure we get all parts
          let bufferElapsed = 0;
          let lastTranscriptLength = pendingTranscript ? pendingTranscript.length : transcriptAtSilence.length;
          let lastFinalTranscriptTime = receivedFinalTranscript ? Date.now() : null;
          let bufferCheckInterval = null; // Store interval reference to prevent duplicates
          
          const checkInterval = 100; // Check every 100ms
          const WAIT_AFTER_FINAL_MS = 2000; // Wait 2 seconds after final transcript to ensure completeness
          
          // Clear any existing buffer check to prevent duplicates
          if (bufferCheckInterval) {
            clearInterval(bufferCheckInterval);
          }
          
          bufferCheckInterval = setInterval(() => {
            bufferElapsed += checkInterval;
            
            // Check if transcript is still being updated (user still speaking)
            const currentLength = pendingTranscript ? pendingTranscript.length : transcriptAtSilence.length;
            const transcriptStillUpdating = currentLength > lastTranscriptLength;
            
            // Update last final transcript time if we just received one
            if (receivedFinalTranscript && !lastFinalTranscriptTime) {
              lastFinalTranscriptTime = Date.now();
            }
            
            if (transcriptStillUpdating) {
              // Transcript is still growing - user is still speaking
              // Reset the buffer timer and wait longer
              lastTranscriptLength = currentLength;
              bufferElapsed = 0; // Reset buffer since transcript is still updating
              lastFinalTranscriptTime = null; // Reset final transcript time since we got an update
              log('ws', 'transcript_still_updating', {
                currentLength,
                bufferElapsed: 0,
                receivedFinal: receivedFinalTranscript
              });
              return; // Continue waiting
            }
            
            // If we received final transcript, wait additional time to ensure we get all parts
            if (receivedFinalTranscript && lastFinalTranscriptTime) {
              const timeSinceFinal = Date.now() - lastFinalTranscriptTime;
              
              // Wait at least 2 seconds after final transcript to ensure completeness
              if (timeSinceFinal >= WAIT_AFTER_FINAL_MS) {
                if (bufferCheckInterval) {
                  clearInterval(bufferCheckInterval);
                  bufferCheckInterval = null;
                }
                log('ws', 'processing_with_final_transcript', {
                  transcriptLength: currentLength,
                  bufferElapsed,
                  timeSinceFinal,
                  receivedFinal: receivedFinalTranscript
                });
                checkForFinalTranscript();
                return;
              }
              // Continue waiting for final transcript buffer
              return;
            }
            
            // If buffer period elapsed AND transcript is stable (not updating), process
            if (bufferElapsed >= FINAL_TRANSCRIPT_BUFFER_MS && !transcriptStillUpdating) {
              if (bufferCheckInterval) {
                clearInterval(bufferCheckInterval);
                bufferCheckInterval = null;
              }
              log('ws', 'processing_after_buffer_timeout', {
                transcriptLength: currentLength,
                bufferElapsed,
                receivedFinal: receivedFinalTranscript
              });
              checkForFinalTranscript();
              return;
            }
            
            // If buffer exceeds maximum wait time (5 seconds), process anyway
            if (bufferElapsed >= 5000) {
              if (bufferCheckInterval) {
                clearInterval(bufferCheckInterval);
                bufferCheckInterval = null;
              }
              log('ws', 'processing_after_max_wait', {
                transcriptLength: currentLength,
                bufferElapsed,
                receivedFinal: receivedFinalTranscript
              });
              checkForFinalTranscript();
              return;
            }
          }, checkInterval);
          
          // Reset transcript time - will be reset when new transcript arrives (speaker starts again)
          // Note: We don't reset lastTranscriptTime here because we want to keep tracking silence
          // The flag llmCallPending prevents multiple calls
        }
      }, 100); // Check every 100ms for precision
      
      // Log only once when interval starts
      log('ws', 'silence_detection_interval_started', { 
        hasPendingTranscript: !!pendingTranscript,
        detectionMethod: 'transcript_based'
      });
    }

    function resetSilenceTimer() {
      // Update timestamp of last audio chunk (for reference/debugging)
      // Note: Silence detection is now transcript-based, not audio-chunk-based
      lastAudioChunkTime = Date.now();
      
      // Log occasionally to verify timestamp is being updated
      if (Math.random() < 0.01) {
        log('ws', 'audio_chunk_timestamp_updated', { 
          timestamp: new Date(lastAudioChunkTime).toISOString(),
          hasPendingTranscript: !!pendingTranscript,
          note: 'Silence detection uses transcript-based timing, not audio chunks'
        });
      }
    }

    function finalizeTranscript() {
      log('ws', 'finalizeTranscript_called', {
        hasPendingTranscript: !!pendingTranscript,
        pendingLength: pendingTranscript ? pendingTranscript.length : 0,
        pendingPreview: pendingTranscript ? pendingTranscript.substring(0, 50) : null
      });
      
      if (!pendingTranscript || pendingTranscript.trim().length === 0) {
        log('ws', 'finalize_skipped_no_pending', {});
        return;
      }

      const finalText = pendingTranscript.trim();
      const userTimestamp = new Date().toISOString();
      
      // Prevent duplicate finalizations of the same transcript
      if (lastFinalizedTranscript === finalText) {
        log('ws', 'skipping_duplicate_finalization', { text: finalText });
        return;
      }
      
      log('ws', 'finalizeTranscript_proceeding', {
        finalTextLength: finalText.length,
        finalTextPreview: finalText.substring(0, 100)
      });

      // PRINT TO CONSOLE - this is what the user wants to see
      console.log('\n========================================');
      console.log('📝 FINAL TRANSCRIPT (after 2s silence):');
      console.log(finalText);
      console.log('========================================\n');
      
      log('ws', 'finalizing_transcript_after_silence', { 
        text: finalText,
        length: finalText.length 
      });
      
      // Track this as the last finalized transcript
      lastFinalizedTranscript = finalText;

      // Send final transcript to frontend (only after 5s silence)
      sendMessage('transcript', { text: finalText, isFinal: true });
      
      // Update status to show we're processing (will change to 'thinking' when LLM starts)
      sendMessage('status', { state: 'processing' });

      // Add to conversation history and trigger LLM
      conversationHistory.push({ role: 'user', content: finalText });

      // Clear pending transcript (already cleared in silence detection handler, but ensure it's cleared)
      pendingTranscript = null;

      // Cancel any in-flight LLM/TTS when a new final user utterance arrives
      if (currentLLMStream && currentLLMStream.cancel) {
        currentLLMStream.cancel();
        currentLLMStream = null;
      }
      if (currentTTSStream && currentTTSStream.cancel) {
        currentTTSStream.cancel();
        currentTTSStream = null;
      }

      sendMessage('status', { state: 'thinking' });
      
      // Clear previous agent response in UI when new LLM call starts
      sendMessage('agent_text', { token: '', clear: true });

      // Store transcript for saving to database
      const transcriptForFile = finalText;
      let llmResponseForFile = '';

      currentLLMStream = createOpenAIStream({
        messages: conversationHistory,
        onToken: (token) => {
          llmResponseForFile += token;
          sendMessage('agent_text', { token });
        },
        onComplete: async (fullText) => {
          llmResponseForFile = fullText;
          conversationHistory.push({ role: 'assistant', content: fullText });

          // Save transcript and LLM response to database with session id
          await saveConversationTurn(transcriptForFile, fullText, 'voice');

          // Send structured pair of user + agent messages for voice mode
          try {
            const agentTimestamp = new Date().toISOString();
            sendMessage('conversation_turn', {
              mode: 'voice',
              user: {
                text: transcriptForFile,
                timestamp: userTimestamp,
              },
              agent: {
                text: fullText,
                timestamp: agentTimestamp,
              },
            });
          } catch (err) {
            log('ws', 'conversation_turn_send_error', {
              error: err.message,
            });
          }

          // Start TTS streaming for the final assistant text
          sendMessage('status', { state: 'speaking' });
          currentTTSStream = createTTSStream({
            text: fullText,
            onAudioChunk: (chunk) => {
              // chunk should be a Buffer/Uint8Array of raw audio
              sendMessage('agent_audio', { audio: chunk.toString('base64') });
            },
            onEnd: () => {
              sendMessage('status', { state: 'idle' });
              currentTTSStream = null;
            },
          });
        },
        onError: async (err) => {
          log('openai', 'llm_error', { error: err.message });
          
          // Save transcript with error message
          const errorResponse = `Error: ${err.message}`;
          await saveConversationTurn(transcriptForFile, errorResponse, 'voice');
          
          sendMessage('status', { state: 'error', error: 'llm_error' });
        },
      });
    }

    function stopDeepgramStream() {
      // Finalize any pending transcript before closing
      if (pendingTranscript && pendingTranscript.trim().length > 0) {
        finalizeTranscript();
      }

      // Clear silence detection
      clearSilenceDetection();

      if (deepgramStream && deepgramStream.close) {
        log('ws', 'stopping_deepgram_stream');
        deepgramStream.close();
        deepgramStream = null;
      }

      // Reset state
      lastAudioChunkTime = null;
      lastTranscriptTime = null; // Reset transcript-based silence detection
      pendingTranscript = null;
      lastFinalizedTranscript = null;
      lastSentTranscript = null;
    }

    ws.on('message', async (data) => {
      try {
        let parsed;
        if (typeof data === 'string') {
          parsed = JSON.parse(data);
        } else {
          parsed = JSON.parse(data.toString());
        }

        const { type, payload, metadata } = parsed;

        if (metadata && metadata.browser_session_id && !browserSessionId) {
          browserSessionId = String(metadata.browser_session_id);
          await resolveUserForBrowserSession(browserSessionId);
        }

        switch (type) {
          case 'start_recording': {
            log('ws', 'start_recording_received');
            isRecording = true;
            startDeepgramStream();
            // Send listening status to frontend (will show "listening..." in UI)
            sendMessage('status', { state: 'listening' });
            break;
          }
          case 'stop_recording': {
            log('ws', 'stop_recording_received');
            isRecording = false;
            stopDeepgramStream();
            sendMessage('status', { state: 'idle' });
            break;
          }
          case 'audio_chunk': {
            if (!payload || !payload.audio) return;
            const buf = Buffer.from(payload.audio, 'base64');
            // Only log occasionally to reduce noise (every 50th chunk)
            if (Math.random() < 0.02) {
              log('ws', 'audio_chunk_received', { 
                bytes: buf.length,
                hasPendingTranscript: !!pendingTranscript 
              });
            }
            // Only send to Deepgram if recording is active
            if (isRecording && deepgramStream && deepgramStream.write) {
              // Reset silence timer - this updates timestamp and restarts detection
              resetSilenceTimer();
              deepgramStream.write(buf);
            }
            break;
          }
          case 'interrupt': {
            log('ws', 'interrupt_received');
            // Cancel any in-flight LLM/TTS and reset state to allow barge-in
            if (currentLLMStream && currentLLMStream.cancel) {
              currentLLMStream.cancel();
            }
            if (currentTTSStream && currentTTSStream.cancel) {
              currentTTSStream.cancel();
            }
            currentLLMStream = null;
            currentTTSStream = null;
            sendMessage('status', { state: 'interrupted' });
            break;
          }
          case 'chat_message': {
            log('ws', 'chat_message_received', { 
              textLength: payload?.text?.length || 0 
            });
            if (payload && payload.text && payload.text.trim()) {
              // Process chat message immediately (no silence detection needed)
              processUserMessage(payload.text, true);
            }
            break;
          }
          default: {
            log('ws', 'unknown_message_type', { type });
          }
        }
      } catch (err) {
        log('ws', 'message_parse_error', { error: err.message });
      }
    });

    ws.on('close', () => {
      log('ws', 'client_disconnected');
      
      // Clear silence detection
      clearSilenceDetection();
      
      // Reset all state
      lastTranscriptTime = null;
      lastAudioChunkTime = null;
      
      if (deepgramStream && deepgramStream.close) {
        deepgramStream.close();
      }
      if (currentLLMStream && currentLLMStream.cancel) {
        currentLLMStream.cancel();
      }
      if (currentTTSStream && currentTTSStream.cancel) {
        currentTTSStream.cancel();
      }
    });

    ws.on('error', (err) => {
      log('ws', 'socket_error', { error: err.message });
    });

    sendMessage('status', { state: 'connected' });
  });

  log('ws', 'websocket_server_initialized');
}

module.exports = {
  initWebSocketServer,
};


