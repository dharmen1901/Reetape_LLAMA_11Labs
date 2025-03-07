import { getMessageHistory, formatHistoryForLLM, addMessage } from "@/app/utils/chatHistory";

export async function fetchGeminiResponse(transcript: string): Promise<string> {
    try {
        console.log(`Processing query: "${transcript}"`);
        
        // Save user's message to history
        await addMessage('user', transcript);
        
        // Get conversation history
        let contextPrompt = "";
        let messages = [];
        try {
            messages = await getMessageHistory();
            if (messages.length > 0) {
                console.log(`Found ${messages.length} previous messages in conversation history`);
                contextPrompt = formatHistoryForLLM(messages);
                console.log(`Added conversation context (${contextPrompt.split('\n').length} lines)`);
            }
        } catch (error) {
            console.warn("Could not load conversation history:", error);
            // Continue without history if there's an error
        }

        // Build the prompt with history
        const prompt = messages.length > 1 
            ? `The following is the conversation history. Please respond to the user's latest message in a helpful, professional manner and with a short answer.

${contextPrompt}`
            : `Respond to the following query in a helpful, professional manner and in very short answer: "${transcript}"`;

        const response = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3.2:3b",
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error("Llama API Error: " + response.statusText);
        }

        const result = await response.json();
        console.log(`Llama Response received (${result.response.length} chars)`);
        
        // Save assistant's response to history
        await addMessage('assistant', result.response);
        
        return result.response;
    } catch (error) {
        console.error("API Error:", error);
        return "I'm sorry, I couldn't process your request at this time.";
    }
}

// Updated streaming function with simpler conversation history
export async function streamGeminiResponse(transcript: string, onToken: (token: string) => void): Promise<void> {
    try {
        console.log(`Streaming response for: "${transcript}"`);
        
        // Save user's message to history
        await addMessage('user', transcript);
        
        // Get conversation history
        let contextPrompt = "";
        let messages = [];
        try {
            messages = await getMessageHistory();
            if (messages.length > 0) {
                console.log(`Found ${messages.length} previous messages in conversation history`);
                contextPrompt = formatHistoryForLLM(messages);
                console.log(`Added conversation context (${contextPrompt.split('\n').length} lines)`);
            }
        } catch (error) {
            console.warn("Could not load conversation history for streaming:", error);
        }

        // Build the prompt with history
        const prompt = messages.length > 1 
            ? `The following is the conversation history. Please respond to the user's latest message in a helpful, professional manner.

${contextPrompt}`
            : `Respond to the following query in a helpful, professional manner: "${transcript}"`;

        const response = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3.2:3b",
                prompt: prompt,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error("Llama API Error: " + response.statusText);
        }

        // Process the stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            
            // Parse JSON chunks - Ollama returns each token as a JSON object
            const lines = chunk.split('\n').filter(Boolean);
            
            for (const line of lines) {
                try {
                    const parsedChunk = JSON.parse(line);
                    if (parsedChunk.response) {
                        fullResponse += parsedChunk.response;
                        onToken(parsedChunk.response);
                    }
                } catch (err) {
                    console.error("Error parsing chunk:", err);
                }
            }
        }
        
        // Save the full response to history after streaming completes
        await addMessage('assistant', fullResponse);
        
    } catch (error) {
        console.error("Streaming API Error:", error);
        onToken("I'm sorry, I couldn't process your request at this time.");
    }
}