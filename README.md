# Deci - UK Startup Equity Tax & Accounting

A professional web application providing expert guidance on UK startup equity taxation and accounting, including EMI schemes, share options, and capital gains tax planning.

## Features

- **Interactive Chat Interface**: Ask questions about UK equity taxation and get detailed guidance
- **EMI Scheme Guidance**: Comprehensive information on Enterprise Management Incentives
- **Share Option Schemes**: Coverage of CSOP, SAYE, and Unapproved options
- **Tax Planning Tools**: Capital gains tax calculations and planning advice
- **Professional UI**: Modern, responsive design with accessibility in mind

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for fast development and building
- CSS modules for styling
- Responsive design with mobile-first approach

### Backend
- Node.js with Express
- TypeScript for type safety
- RESTful API design
- CORS and security middleware

## Project Structure

```
deci/
├── frontend/           # React frontend application
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── App.tsx     # Main app component
│   │   └── index.tsx   # App entry point
│   ├── public/         # Static assets
│   └── package.json
├── backend/            # Express backend API
│   ├── src/
│   │   ├── routes/     # API routes
│   │   ├── services/   # Business logic
│   │   └── server.ts   # Server entry point
│   └── package.json
└── package.json        # Root package.json
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/sameernusrat/Deci.git
cd Deci
```

2. Install all dependencies:
```bash
npm run install:all
```

3. Set up environment variables:
```bash
cp backend/.env.example backend/.env
```

### Development

Start both frontend and backend in development mode:
```bash
npm run dev
```

This will start:
- Backend API server on http://localhost:3001
- Frontend development server on http://localhost:3000

### Individual Services

Run frontend only:
```bash
npm run dev:frontend
```

Run backend only:
```bash
npm run dev:backend
```

### Building for Production

Build both frontend and backend:
```bash
npm run build
```

Build individual services:
```bash
npm run build:frontend
npm run build:backend
```

### Running in Production

```bash
npm start
```

## API Endpoints

### Chat API
- `POST /api/chat/message` - Send a message to the chat assistant
- `GET /api/chat/topics` - Get available discussion topics

### Advice API
- `GET /api/advice/emi-eligibility` - Get EMI scheme eligibility requirements
- `POST /api/advice/emi-check` - Check company EMI eligibility
- `GET /api/advice/tax-rates` - Get current UK tax rates
- `POST /api/advice/tax-calculation` - Calculate tax scenarios

## Key Topics Covered

### EMI Schemes
- Eligibility requirements for companies and employees
- Tax implications and benefits
- Setup and management process
- Valuation requirements

### Share Option Schemes
- **CSOP (Company Share Option Plan)**: HMRC-approved scheme with tax advantages
- **SAYE (Save As You Earn)**: All-employee scheme with savings element
- **Unapproved Options**: Flexible schemes without HMRC approval

### UK Tax Planning
- Capital gains tax rates and allowances
- Business Asset Disposal Relief
- Income tax implications
- Tax optimization strategies

## Development Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Install dependencies
npm run install:all
npm run install:frontend
npm run install:backend
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and type checking
5. Submit a pull request

## Disclaimer

This application provides general information about UK tax and accounting matters. It does not constitute professional advice and should not be relied upon for making specific decisions. Always consult with qualified tax advisors and accountants for your particular circumstances.

## License

ISC License - see LICENSE file for details.