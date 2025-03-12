import { promises as fs } from 'fs';
import path from 'path';

// Simple chat message type
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const HISTORY_DIR = path.join(process.cwd(), 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'chat-history.json');

// Initialize history file if it doesn't exist
export async function initChatHistory(): Promise<void> {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    try {
      await fs.access(HISTORY_FILE);
    } catch (e) {
      // File doesn't exist, create it with empty messages array
      await fs.writeFile(HISTORY_FILE, JSON.stringify({ messages: [] }));
    }
  } catch (error) {
    console.error('Error initializing chat history:', error);
  }
}

// Add a message to the chat history
export async function addMessage(
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  try {
    const history = await readHistory();
    
    history.messages.push({
      role,
      content
    });
    
    await writeHistory(history);
  } catch (error) {
    console.error('Error adding message:', error);
  }
}

// Get the conversation history
export async function getMessageHistory(): Promise<ChatMessage[]> {
  try {
    const history = await readHistory();
    return history.messages;
  } catch (error) {
    console.error('Error getting message history:', error);
    return [];
  }
}

// Clear all history
export async function clearHistory(): Promise<void> {
  try {
    await writeHistory({ messages: [] });
  } catch (error) {
    console.error('Error clearing history:', error);
  }
}

// Format chat history for LLM context (limit to last N messages to avoid token limits)
export function formatHistoryForLLM(messages: ChatMessage[], limit = 10): string {
  const recentMessages = messages.slice(-limit);
  
  return recentMessages.map(msg => {
    const role = msg.role === 'user' ? 'user' : 'assistant';
    return `"${role}": "${msg.content}"`;
  }).join('\n');
}

// Private helper functions
async function readHistory(): Promise<{ messages: ChatMessage[] }> {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading history file:', error);
    return { messages: [] };
  }
}

async function writeHistory(history: { messages: ChatMessage[] }): Promise<void> {
  try {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Error writing history file:', error);
  }
}