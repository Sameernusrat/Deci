export interface ChatResponse {
  text: string;
  suggestions: string[];
  relatedTopics: string[];
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

  async processMessage(message: string, context?: any): Promise<ChatResponse> {
    const lowerMessage = message.toLowerCase();
    
    // Simple keyword-based responses for demo
    if (lowerMessage.includes('emi')) {
      return {
        text: `EMI (Enterprise Management Incentives) schemes are the UK's most tax-efficient way to grant share options to employees. Key benefits include:

• No income tax or NICs on grant if options are granted at market value
• Potential capital gains treatment on exercise
• Eligibility for Business Asset Disposal Relief (10% CGT rate)
• Up to £3 million total EMI options per company
• Maximum £250,000 per employee

Would you like specific guidance on EMI eligibility requirements or setup process?`,
        suggestions: [
          'What are EMI eligibility requirements?',
          'How do I set up an EMI scheme?',
          'What are the tax implications of EMI options?'
        ],
        relatedTopics: ['Share Valuations', 'Capital Gains Tax', 'Business Asset Disposal Relief']
      };
    }

    if (lowerMessage.includes('capital gains') || lowerMessage.includes('cgt')) {
      return {
        text: `Capital Gains Tax (CGT) on shares for 2023/24:

• Annual CGT allowance: £6,000
• Basic rate taxpayers: 10% on gains
• Higher/additional rate taxpayers: 20% on gains
• Business Asset Disposal Relief: 10% rate up to £1 million lifetime limit
• Investors' Relief: 10% for qualifying external investors

Key considerations include timing of disposals, available reliefs, and whether gains qualify as business assets.`,
        suggestions: [
          'How does Business Asset Disposal Relief work?',
          'When does CGT apply vs income tax?',
          'Can I defer capital gains tax?'
        ],
        relatedTopics: ['Business Asset Disposal Relief', 'EMI Schemes', 'Tax Planning']
      };
    }

    if (lowerMessage.includes('share option') || lowerMessage.includes('csop') || lowerMessage.includes('saye')) {
      return {
        text: `UK Share Option Schemes overview:

**CSOP (Company Share Option Plan):**
• HMRC approved scheme
• Up to £60,000 per employee
• No income tax if held for 3+ years

**SAYE (Save As You Earn):**
• All-employee scheme
• Linked to savings contract
• 3 or 5-year savings periods

**Unapproved Options:**
• Maximum flexibility in design
• Income tax and NICs on exercise
• No HMRC approval required

Each scheme has different tax implications and suitability depending on company circumstances.`,
        suggestions: [
          'Which scheme is best for my company?',
          'What are the tax differences between schemes?',
          'How do unapproved options work?'
        ],
        relatedTopics: ['EMI Schemes', 'Tax Planning', 'Income Tax on Shares']
      };
    }

    // Default response
    return {
      text: `I'm here to help with UK startup equity tax and accounting questions. I can provide guidance on:

• EMI schemes and eligibility
• Share option schemes (CSOP, SAYE, Unapproved)
• Capital gains tax on shares
• Income tax implications
• Business Asset Disposal Relief
• Tax planning strategies
• Share valuations

What specific area would you like to explore?`,
      suggestions: [
        'Tell me about EMI schemes',
        'What are the different share option schemes?',
        'How is capital gains tax calculated?',
        'What is Business Asset Disposal Relief?'
      ],
      relatedTopics: this.topics.slice(0, 4)
    };
  }

  getAvailableTopics(): string[] {
    return this.topics;
  }
}