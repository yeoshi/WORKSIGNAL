import { generateText } from 'ai';
import { getBedrockModel } from './bedrockStream';

/** Single-shot Bedrock text call for backend services expecting a prompt string. */
export function createBedrockTextInvoke() {
  return async (prompt: string): Promise<string> => {
    const { text } = await generateText({
      model: getBedrockModel(),
      prompt,
    });
    return text;
  };
}
