const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * System prompt for hospital receptionist AI assistant.
 * 
 * The AI should:
 * - Greet patients warmly and professionally
 * - Listen to patient concerns and symptoms
 * - Collect necessary information for appointment booking:
 *   - Patient name
 *   - Contact information (phone/email)
 *   - Preferred appointment date/time
 *   - Reason for visit / symptoms
 *   - Preferred doctor/specialty (if applicable)
 * - Be empathetic and understanding
 * - Confirm appointment details before finalizing
 * - Keep responses concise and natural for voice conversation
 */
const SYSTEM_PROMPT = `You are a friendly and professional AI receptionist at a modern hospital. Your role is to:

1. **Greet patients warmly** when they first call or speak
2. **Listen actively** to their concerns and symptoms
3. **Collect appointment information**:
   - Patient's full name
   - Contact phone number and/or email
   - Reason for visit or symptoms
   - Preferred date and time for appointment
   - Preferred doctor or specialty (if they have one)
   - Any urgent medical concerns

4. **Be empathetic and understanding** - patients may be anxious or in pain
5. **Keep responses concise** - this is a voice conversation, so be natural and brief
6. **Confirm details** before finalizing the appointment
7. **Ask clarifying questions** if information is unclear

Guidelines:
- Speak naturally and conversationally
- Don't ask for all information at once - gather it naturally through conversation
- If the patient seems urgent or mentions severe symptoms, acknowledge it appropriately
- Be professional but warm and friendly
- Keep your responses under 2-3 sentences when possible for voice interaction`;

/**
 * Create a streaming OpenAI chat completion.
 *
 * This wrapper:
 * - Accepts a sequence of messages (conversation history).
 * - Adds system prompt for hospital receptionist role.
 * - Streams back tokens via onToken.
 * - Calls onComplete with the full assistant message at the end.
 * - Exposes cancel() for interruption.
 */
function createOpenAIStream({ messages, onToken, onComplete, onError }) {
  if (!OPENAI_API_KEY) {
    console.warn('[openai] OPENAI_API_KEY not set. LLM will be disabled.');
    const fakeText = 'LLM is not configured. Please set OPENAI_API_KEY.';
    if (onToken) onToken(fakeText);
    if (onComplete) onComplete(fakeText);
    return {
      cancel: () => {},
    };
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const controller = new AbortController();
  let fullText = '';

  // Prepare messages with system prompt
  const messagesWithSystem = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
  ];

  (async () => {
    try {
      const stream = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messagesWithSystem,
        stream: true,
        temperature: 0.7, // Balanced creativity and consistency
        max_tokens: 500, // Keep responses concise for voice interaction
      }, { signal: controller.signal });

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          if (onToken) onToken(delta);
        }
      }

      if (onComplete) onComplete(fullText);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[openai] stream aborted');
        return;
      }
      console.error('[openai] streaming error', err);
      if (onError) onError(err);
    }
  })();

  return {
    cancel() {
      controller.abort();
    },
  };
}

module.exports = {
  createOpenAIStream,
};


