import { Logger } from '../utils/Logger';
import { CircuitBreaker, CircuitBreakerOptions } from '../utils/CircuitBreaker';

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
  service_health?: {
    ollama: 'healthy' | 'degraded' | 'down';
    rag: 'healthy' | 'degraded' | 'down';
  };
}

interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
  system?: string;
}

interface RAGResponse {
  answer: string;
  sources: any[];
  metadata: any;
  rag_available: boolean;
  fallback_mode?: boolean;
  error?: string;
}

export class BulletproofChatService {
  private logger: Logger;
  private ollamaCircuitBreaker: CircuitBreaker;
  private ragCircuitBreaker: CircuitBreaker;
  private isInitialized: boolean = false;
  private initializationError: Error | null = null;

  private readonly topics = [
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

  private readonly systemPrompt = `You are an AI advisor specializing in UK EMPLOYMENT EQUITY COMPENSATION. Provide accurate, practical advice about share options, EMI schemes, tax implications, and employee equity packages.

IMPORTANT: When users mention "UK" or ask UK-specific questions, focus ONLY on UK rules: EMI schemes, CSOP, SAYE, UK tax rates, and UK-specific regulations.

FORMAT responses like this:
**[Relevant Heading]**
• [Key point about employee equity]
• [Keep each point to one sentence]

**Tax Implications**
• [Specific tax point for the relevant jurisdiction]

**Next Steps**
1. [Specific actionable step]
2. [Additional practical guidance]

CRITICAL: 
- EMI = Enterprise Management Incentives (NOT EML)
- Be confident and authoritative in your recommendations
- ALWAYS provide complete, comprehensive responses
- Specify which jurisdiction your advice applies to`;

  constructor() {
    this.logger = new Logger('BulletproofChatService');
    this.logger.info('Initializing BulletproofChatService...');

    try {
      // Initialize circuit breakers
      this.ollamaCircuitBreaker = new CircuitBreaker(
        this.executeOllamaCall.bind(this),
        {
          failureThreshold: 3,
          resetTimeout: 30000, // 30 seconds
          timeout: 45000,      // 45 seconds
          name: 'Ollama'
        }
      );

      this.ragCircuitBreaker = new CircuitBreaker(
        this.executeRAGCall.bind(this),
        {
          failureThreshold: 3,
          resetTimeout: 30000, // 30 seconds  
          timeout: 60000,      // 60 seconds
          name: 'RAG'
        }
      );

      this.isInitialized = true;
      this.logger.info('BulletproofChatService initialized successfully');

    } catch (error: any) {
      this.logger.error('Failed to initialize BulletproofChatService', error);
      this.initializationError = error;
      this.isInitialized = false;
    }
  }

  private async executeRAGCall(question: string): Promise<RAGResponse> {
    this.logger.debug('Executing RAG call', { question });
    
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      // Escape the question for shell execution
      const escapedQuestion = question.replace(/'/g, "'\"'\"'");
      const command = `python3 /Users/sameernusrat/deci/rag_bridge.py '${escapedQuestion}'`;
      
      this.logger.debug('Executing RAG command', { command });
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 45000, // 45 second timeout for RAG
        cwd: '/Users/sameernusrat/deci'
      });
      
      if (stderr) {
        this.logger.warn('RAG stderr output', { stderr });
      }
      
      // Parse the JSON response
      const ragResponse: RAGResponse = JSON.parse(stdout);
      this.logger.debug('RAG response received', { 
        available: ragResponse.rag_available,
        hasAnswer: !!ragResponse.answer,
        sourcesCount: ragResponse.sources?.length || 0
      });
      
      return ragResponse;

    } catch (error: any) {
      this.logger.error('RAG call failed', error);
      throw new Error(`RAG system error: ${error.message}`);
    }
  }

  private async executeOllamaCall(prompt: string, systemPrompt?: string): Promise<string> {
    this.logger.debug('Executing Ollama call', { promptLength: prompt.length });
    
    try {
      const axios = require('axios');
      
      const requestBody: OllamaRequest = {
        model: 'llama3.2',
        prompt: prompt,
        stream: false,
        system: systemPrompt || this.systemPrompt
      };

      const response = await axios.post('http://localhost:11434/api/generate', requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 40000 // 40 seconds
      });

      this.logger.debug('Ollama response received', { 
        responseLength: response.data.response?.length || 0 
      });
      
      return response.data.response;

    } catch (error: any) {
      this.logger.error('Ollama call failed', error);
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('Ollama request timed out');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama service is not available');
      }
      
      throw new Error(`Ollama error: ${error.message}`);
    }
  }

  private async safeRAGCall(question: string): Promise<RAGResponse | null> {
    try {
      return await this.ragCircuitBreaker.execute(question);
    } catch (error: any) {
      this.logger.warn('RAG call failed through circuit breaker', error);
      return null;
    }
  }

  private async safeOllamaCall(prompt: string, systemPrompt?: string): Promise<string | null> {
    try {
      return await this.ollamaCircuitBreaker.execute(prompt, systemPrompt);
    } catch (error: any) {
      this.logger.warn('Ollama call failed through circuit breaker', error);
      return null;
    }
  }

  private generateFallbackResponse(message: string): ChatResponse {
    this.logger.info('Generating fallback response');
    
    const isGreeting = /^(hi|hello|hey)!?$/i.test(message.trim());
    
    if (isGreeting) {
      return {
        text: "Hi! How can I help you today? I can help you with all things Equity so shoot your questions!",
        suggestions: [
          'Tell me about EMI schemes',
          'What are CSOP schemes?',
          'How does capital gains tax work on shares?'
        ],
        relatedTopics: this.topics.slice(0, 4),
        rag_used: false,
        service_health: {
          ollama: 'down',
          rag: 'down'
        }
      };
    }
    
    return {
      text: `**Service Notice**

I'm currently operating in limited mode due to external service issues, but I can still help with general equity compensation questions.

**I specialize in:**
• EMI schemes and eligibility requirements
• Share option schemes (CSOP, SAYE, Unapproved)
• Capital gains tax on shares
• Income tax implications of equity compensation
• Business Asset Disposal Relief
• Tax planning strategies for equity

**What to try:**
1. Ask specific questions about UK equity schemes
2. Request information about tax implications
3. Check back in a few minutes for full service

The system will automatically recover when external services are restored.`,
      suggestions: [
        'Tell me about EMI scheme eligibility',
        'What are the tax benefits of CSOP?',
        'How is Business Asset Disposal Relief calculated?'
      ],
      relatedTopics: this.topics,
      rag_used: false,
      service_health: {
        ollama: 'down',
        rag: 'down'
      }
    };
  }

  async processMessage(message: string, context?: any): Promise<ChatResponse> {
    this.logger.info('Processing message', { messageLength: message.length });
    
    try {
      // Check initialization
      if (!this.isInitialized) {
        this.logger.error('Service not initialized', this.initializationError);
        return this.generateFallbackResponse(message);
      }

      let finalResponse: string | null = null;
      let usedRAG = false;
      let sources: any[] = [];
      let serviceHealth = {
        ollama: 'healthy' as const,
        rag: 'healthy' as const
      };

      // Try RAG first
      this.logger.debug('Attempting RAG call...');
      const ragResponse = await this.safeRAGCall(message);
      
      if (ragResponse && ragResponse.rag_available && ragResponse.answer && !ragResponse.fallback_mode) {
        this.logger.info('Using RAG response', { sourcesCount: ragResponse.sources?.length || 0 });
        finalResponse = ragResponse.answer;
        sources = ragResponse.sources || [];
        usedRAG = true;
        
        if (sources.length > 0) {
          finalResponse += '\n\n*This response is based on official HMRC documentation.*';
        }
      } else {
        this.logger.info('RAG unavailable, trying Ollama fallback');
        serviceHealth.rag = 'down';
        
        // Try Ollama as fallback
        let contextFromRAG = '';
        if (ragResponse?.sources && ragResponse.sources.length > 0) {
          contextFromRAG = ragResponse.sources
            .map((source: any) => `From HMRC ${source.section_title || source.section}:\n${source.snippet}`)
            .join('\n\n---\n\n');
          sources = ragResponse.sources;
          serviceHealth.rag = 'degraded';
        }
        
        const ollamaResponse = await this.safeOllamaCall(message, contextFromRAG ? 
          `${this.systemPrompt}\n\nHMRC CONTEXT:\n${contextFromRAG}` : undefined);
        
        if (ollamaResponse) {
          finalResponse = this.formatResponse(ollamaResponse, message);
          if (contextFromRAG) {
            finalResponse += '\n\n*This response is enhanced with official HMRC documentation.*';
          }
        } else {
          serviceHealth.ollama = 'down';
        }
      }

      // If everything failed, use fallback
      if (!finalResponse) {
        this.logger.warn('All services failed, using fallback');
        return this.generateFallbackResponse(message);
      }

      const response: ChatResponse = {
        text: finalResponse,
        suggestions: this.generateSuggestions(finalResponse, message),
        relatedTopics: this.extractRelatedTopics(finalResponse),
        rag_used: usedRAG,
        service_health: serviceHealth
      };

      if (sources.length > 0) {
        response.sources = sources;
      }

      this.logger.info('Message processed successfully', { 
        responseLength: finalResponse.length,
        ragUsed: usedRAG,
        sourcesCount: sources.length 
      });
      
      return response;

    } catch (error: any) {
      this.logger.error('Error processing message', error);
      return this.generateFallbackResponse(message);
    }
  }

  private formatResponse(response: string, originalMessage: string): string {
    // Simple formatting without complex logic that could fail
    return response.trim();
  }

  private generateSuggestions(response: string, originalMessage: string): string[] {
    const baseSuggestions = [
      'Can you explain this in more detail?',
      'What are the next steps I should take?',
      'Are there any risks I should be aware of?'
    ];

    try {
      if (response.toLowerCase().includes('emi')) {
        baseSuggestions.push('How do I set up an EMI scheme?');
      }
      if (response.toLowerCase().includes('tax')) {
        baseSuggestions.push('What are the tax implications?');
      }
      if (response.toLowerCase().includes('valuation')) {
        baseSuggestions.push('How is share valuation determined?');
      }
    } catch (error) {
      this.logger.warn('Error generating suggestions', error);
    }

    return baseSuggestions.slice(0, 3);
  }

  private extractRelatedTopics(response: string): string[] {
    const relatedTopics: string[] = [];
    
    try {
      this.topics.forEach(topic => {
        if (response.toLowerCase().includes(topic.toLowerCase())) {
          relatedTopics.push(topic);
        }
      });
    } catch (error) {
      this.logger.warn('Error extracting related topics', error);
    }

    return relatedTopics.length > 0 ? relatedTopics.slice(0, 4) : this.topics.slice(0, 4);
  }

  getAvailableTopics(): string[] {
    return this.topics;
  }

  getServiceHealth() {
    return {
      initialized: this.isInitialized,
      initializationError: this.initializationError?.message,
      ollama: this.ollamaCircuitBreaker.getStats(),
      rag: this.ragCircuitBreaker.getStats()
    };
  }

  resetCircuitBreakers(): void {
    this.ollamaCircuitBreaker.reset();
    this.ragCircuitBreaker.reset();
    this.logger.info('Circuit breakers reset');
  }
}