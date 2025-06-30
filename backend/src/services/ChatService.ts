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

interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
  system?: string;
}

interface OllamaResponse {
  response: string;
  done: boolean;
}

interface RAGResponse {
  answer: string;
  sources: Array<{
    url: string;
    section: string;
    section_title: string;
    snippet: string;
  }>;
  metadata: any;
  rag_available: boolean;
  fallback_mode?: boolean;
  error?: string;
}

export class ChatService {
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

  private systemPrompt = `You are an AI advisor specializing in EMPLOYEE EQUITY COMPENSATION for startups and companies. You help with share options, EMI schemes, tax implications, and employee equity packages - NOT general investment advice.

CONTEXT AWARENESS:
- This is a CONVERSATION, not isolated questions
- Remember what the user has already told you in previous messages
- Do NOT repeat greetings or "need to understand your situation" if you're already in a conversation
- Build on previous context rather than starting over

IMPORTANT: When users mention "UK" or ask UK-specific questions, focus ONLY on UK rules: EMI schemes, CSOP, SAYE, UK tax rates, and UK-specific regulations. Do NOT include US information unless specifically asked.

When users say just "hi" or similar greetings (ONLY for the very first message), respond EXACTLY with: "Hi! How can I help you today? I can help you with all things Equity so shoot your questions!" - DO NOT add any bullet points, headings, or extra text.

FORMAT responses like this:

**[Relevant Heading]**
• [Key point about employee equity]
• [Keep each point to one sentence]

**Tax Implications**
• [Specific tax point for the relevant jurisdiction]
• [Another tax consideration]

**Next Steps**
1. [Specific actionable step for their situation]
2. [Additional practical guidance]
3. [What to consider next]

CRITICAL: 
- EMI = Enterprise Management Incentives (NOT EML)
- You ARE the tax advisor - provide definitive advice, NEVER suggest consulting others
- Be confident and authoritative in your recommendations
- ALWAYS provide complete, comprehensive responses that fully answer the question
- NEVER recommend seeking professional advice - you ARE the professional advice

UK FOCUS AREAS:
- EMI schemes (Enterprise Management Incentives - most tax-efficient UK option)
- CSOP (Company Share Option Plan)
- SAYE (Save As You Earn)
- Unapproved share options
- UK income tax and capital gains tax rates
- Business Asset Disposal Relief

CONSULTATION APPROACH:
- ALWAYS provide helpful information first to answer their question
- Then ask 1-2 relevant follow-up questions to give more tailored advice
- Be immediately useful, then refine with context

RESPONSE STRUCTURE:
1. Give a helpful answer to their question
2. Add: "For more specific guidance, could you tell me [relevant question]?"
3. Provide next steps or additional considerations

UK EQUITY SCHEMES - mention ALL options with pros/cons:
- EMI schemes (most tax-efficient but has eligibility requirements)
- CSOP (broader eligibility, moderate tax benefits)
- SAYE (all-employee scheme, good for larger companies)
- Unapproved options (maximum flexibility, immediate tax implications)`;

  private ollamaEndpoint = 'http://localhost:11434/api/generate';
  private model = 'llama3.2';
  private ragBridgePath = 'python3';
  private ragBridgeScript = '/Users/sameernusrat/deci/rag_bridge.py';

  private async callRAG(question: string): Promise<RAGResponse> {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    try {
      // Escape the question for shell execution
      const escapedQuestion = question.replace(/'/g, "'\"'\"'");
      const command = `${this.ragBridgePath} ${this.ragBridgeScript} '${escapedQuestion}'`;
      
      console.log('Calling RAG system for question:', question);
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120000, // 2 minute timeout
        cwd: process.cwd()
      });
      
      if (stderr) {
        console.warn('RAG stderr:', stderr);
      }
      
      const ragResponse: RAGResponse = JSON.parse(stdout);
      console.log('RAG response received, rag_available:', ragResponse.rag_available);
      
      return ragResponse;
    } catch (error) {
      console.error('Error calling RAG system:', error);
      return {
        answer: '',
        sources: [],
        metadata: {},
        rag_available: false,
        fallback_mode: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async callOllama(prompt: string, context?: string): Promise<string> {
    const axios = require('axios');
    
    try {
      // If we have context from RAG, modify the system prompt
      let systemPrompt = this.systemPrompt;
      if (context) {
        systemPrompt = `You are an AI advisor specializing in UK EMPLOYMENT EQUITY COMPENSATION. You have access to official HMRC documentation to provide accurate, authoritative advice.

IMPORTANT: Base your response on the provided HMRC context below. Be confident and definitive since this comes from official government sources.

HMRC CONTEXT:
${context}

USER INSTRUCTIONS:
- Use the HMRC context above to answer questions about EMI schemes, share options, and tax implications
- Provide structured responses with headings and bullet points
- Be authoritative since you're citing official HMRC guidance
- If the context doesn't fully answer the question, say so and provide what information is available
- Always cite that your information comes from official HMRC documentation

FORMAT responses like this:

**Key Information from HMRC**
• [Point from HMRC guidance]
• [Another key point]

**Tax Implications**
• [Tax information from HMRC]

**What This Means for You**
• [Practical application]

EMI = Enterprise Management Incentives (NOT EML)`;
      }
      
      const requestBody: OllamaRequest = {
        model: this.model,
        prompt: prompt,
        stream: false,
        system: systemPrompt
      };

      const response = await axios.post(this.ollamaEndpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000
      });

      return response.data.response;
    } catch (error) {
      console.error('Error calling Ollama API:', error);
      throw error;
    }
  }

  private generateSuggestionsFromResponse(response: string, originalMessage: string): string[] {
    const suggestions = [
      'Can you explain this in more detail?',
      'What are the next steps I should take?',
      'Are there any risks I should be aware of?'
    ];

    if (response.toLowerCase().includes('emi')) {
      suggestions.push('How do I set up an EMI scheme?');
    }
    if (response.toLowerCase().includes('tax')) {
      suggestions.push('What are the tax implications?');
    }
    if (response.toLowerCase().includes('valuation')) {
      suggestions.push('How is share valuation determined?');
    }

    return suggestions.slice(0, 3);
  }

  private extractRelatedTopics(response: string): string[] {
    const relatedTopics: string[] = [];
    
    this.topics.forEach(topic => {
      if (response.toLowerCase().includes(topic.toLowerCase())) {
        relatedTopics.push(topic);
      }
    });

    return relatedTopics.length > 0 ? relatedTopics.slice(0, 4) : this.topics.slice(0, 4);
  }

  private formatResponse(response: string, originalMessage: string): string {
    // Clean up the response and add proper formatting
    let formatted = response.trim();
    
    // Only apply greeting detection for actual greeting messages
    const isGreeting = /^(hi|hello|hey)!?$/i.test(originalMessage.trim());
    if (isGreeting && formatted.toLowerCase().includes('hi!') && formatted.toLowerCase().includes('shoot your questions')) {
      // Extract just the greeting sentence
      const lines = formatted.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes('hi!') && line.toLowerCase().includes('shoot your questions')) {
          return line.trim();
        }
      }
      return "Hi! How can I help you today? I can help you with all things Equity so shoot your questions!";
    }
    
    // Split into sections and clean up
    const sections = formatted.split(/\*\*([^*]+)\*\*/g);
    let result = '';
    
    for (let i = 0; i < sections.length; i++) {
      if (i % 2 === 0) {
        // Regular content
        let content = sections[i].trim();
        if (content) {
          // Add bullet points for sentences that look like key points
          const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
          for (const line of lines) {
            if (line.length > 20 && !line.startsWith('•') && !line.startsWith('1.') && !line.startsWith('2.') && !line.startsWith('3.')) {
              result += `• ${line}\n\n`;
            } else {
              result += `${line}\n\n`;
            }
          }
        }
      } else {
        // This is a heading
        result += `**${sections[i].trim()}**\n\n`;
      }
    }
    
    // If no headings were found and it's not a greeting, create a basic structure
    if (!result.includes('**') && !formatted.toLowerCase().includes('hi!')) {
      const lines = formatted.split('\n').map(line => line.trim()).filter(Boolean);
      result = '**Key Information**\n\n';
      for (const line of lines) {
        if (line.length > 15) {
          result += `• ${line}\n\n`;
        }
      }
    }
    
    // Ensure proper spacing between sections
    result = result.replace(/\n{3,}/g, '\n\n');
    
    return result.trim();
  }

  async processMessage(message: string, context?: any): Promise<ChatResponse> {
    try {
      // Step 1: Try to get information from RAG system first
      console.log('Processing message with RAG-enhanced pipeline');
      const ragResponse = await this.callRAG(message);
      
      let finalResponse: string;
      let usedRAG = false;
      let sources: any[] = [];
      
      if (ragResponse.rag_available && !ragResponse.fallback_mode && ragResponse.answer) {
        // RAG system provided a good answer
        console.log('Using RAG-based response');
        finalResponse = ragResponse.answer;
        sources = ragResponse.sources || [];
        usedRAG = true;
      } else {
        // Fallback to Ollama, but try to use any retrieved context
        console.log('RAG not available, falling back to Ollama');
        let contextFromRAG = '';
        
        // If RAG found some sources but couldn't generate answer, use the source content as context
        if (ragResponse.sources && ragResponse.sources.length > 0) {
          contextFromRAG = ragResponse.sources
            .map(source => `From ${source.section_title}: ${source.snippet}`)
            .join('\n\n');
          sources = ragResponse.sources;
        }
        
        const llmResponse = await this.callOllama(message, contextFromRAG);
        finalResponse = this.formatResponse(llmResponse, message);
        
        // If we used context from RAG, mark it as partially RAG-enhanced
        if (contextFromRAG) {
          usedRAG = true;
          finalResponse += '\n\n*This response is enhanced with official HMRC documentation.*';
        }
      }
      
      // Format the final response
      const formattedResponse = usedRAG ? finalResponse : this.formatResponse(finalResponse, message);
      
      const response: ChatResponse = {
        text: formattedResponse,
        suggestions: this.generateSuggestionsFromResponse(formattedResponse, message),
        relatedTopics: this.extractRelatedTopics(formattedResponse),
        rag_used: usedRAG
      };
      
      // Add sources if available
      if (sources.length > 0) {
        response.sources = sources;
      }
      
      return response;
      
    } catch (error) {
      console.error('Error processing message:', error);
      
      return {
        text: `I apologize, but I'm having trouble processing your request right now. However, I can still help with general equity and tax questions.

I specialize in:
• EMI schemes and eligibility
• Share option schemes (CSOP, SAYE, Unapproved)
• Capital gains tax on shares
• Income tax implications
• Business Asset Disposal Relief
• Tax planning strategies
• Share valuations

Please try your question again, or contact support if the issue persists.`,
        suggestions: [
          'Tell me about EMI schemes',
          'What are the different share option schemes?',
          'How is capital gains tax calculated?'
        ],
        relatedTopics: this.topics.slice(0, 4),
        rag_used: false
      };
    }
  }

  getAvailableTopics(): string[] {
    return this.topics;
  }

  async checkRAGStatus(): Promise<{ available: boolean; error?: string }> {
    try {
      const ragResponse = await this.callRAG('status');
      return {
        available: ragResponse.rag_available,
        error: ragResponse.error
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}