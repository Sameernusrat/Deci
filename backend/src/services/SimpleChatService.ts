export interface ChatResponse {
  text: string;
  suggestions: string[];
  relatedTopics: string[];
  sources?: Array<{
    url: string;
    section: string;
    section_title: string;
    snippet: string;
  }>;
  rag_used?: boolean;
}

export class SimpleChatService {
  private topics = [
    'EMI Schemes',
    'Share Options',
    'Capital Gains Tax',
    'Income Tax on Shares',
    'Business Asset Disposal Relief',
    'CSOP Schemes',
    'SAYE Schemes',
    'Unapproved Options',
    'Share Valuations',
    'Tax Planning'
  ];

  async processMessage(message: string, context?: any): Promise<ChatResponse> {
    console.log('Processing message with SimpleChatService:', message);
    
    // Simple response without RAG/Ollama for debugging
    const response: ChatResponse = {
      text: `Hi! I received your message: "${message}". I can help you with all things Equity so shoot your questions!`,
      suggestions: [
        'Tell me about EMI schemes',
        'What are the different share option schemes?',
        'How is capital gains tax calculated?'
      ],
      relatedTopics: this.topics.slice(0, 4),
      rag_used: false
    };
    
    return response;
  }

  getAvailableTopics(): string[] {
    return this.topics;
  }
}