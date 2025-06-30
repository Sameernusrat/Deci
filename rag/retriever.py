import os
from typing import List, Dict, Any, Optional
from datetime import datetime

from langchain.chains import RetrievalQA
from langchain.schema import Document
from langchain_community.llms import Ollama
from langchain.prompts import PromptTemplate

from vector_store import HMRCVectorStore


class HMRCRetriever:
    """RAG retriever for HMRC employment-related securities using Chroma vector store and Ollama LLM."""
    
    def __init__(self, 
                 ollama_base_url: str = "http://localhost:11434",
                 model_name: str = "llama3.2",
                 vector_store_dir: str = ".chromadb",
                 collection_name: str = "hmrc_employment_securities",
                 k: int = 5):
        """
        Initialize the RAG retriever.
        
        Args:
            ollama_base_url: Ollama server URL
            model_name: Ollama model name
            vector_store_dir: Directory containing Chroma database
            collection_name: Chroma collection name
            k: Number of documents to retrieve for context
        """
        self.ollama_base_url = ollama_base_url
        self.model_name = model_name
        self.k = k
        
        # Initialize Ollama LLM
        print(f"Connecting to Ollama at {ollama_base_url} with model {model_name}")
        self.llm = Ollama(
            base_url=ollama_base_url,
            model=model_name,
            temperature=0.7,
            top_p=0.9
        )
        
        # Initialize vector store
        print("Loading vector store...")
        self.vector_store_manager = HMRCVectorStore(
            persist_directory=vector_store_dir,
            collection_name=collection_name
        )
        
        # Get the retriever from vector store
        self.retriever = self.vector_store_manager.vector_store.as_retriever(
            search_kwargs={"k": k}
        )
        
        # Initialize QA chain
        self._setup_qa_chain()
        
        print(" RAG retriever initialized successfully")
    
    def _setup_qa_chain(self):
        """Setup the RetrievalQA chain with custom prompt."""
        
        # Custom prompt template for HMRC equity advice
        prompt_template = """You are an AI advisor specializing in UK EMPLOYMENT EQUITY COMPENSATION and HMRC regulations. Use the provided context from official HMRC documentation to answer questions about share options, EMI schemes, tax implications, and employment-related securities.

INSTRUCTIONS:
- Provide accurate, authoritative advice based ONLY on the HMRC context provided
- Focus on UK-specific rules and regulations
- Be confident and definitive in your responses
- If the context doesn't contain enough information, say so clearly
- Always cite the specific HMRC sections that support your answer
- Format your response with clear headings and bullet points
- EMI = Enterprise Management Incentives (NOT EML)

Context from HMRC documentation:
{context}

Question: {question}

Answer with clear structure:
**Key Points**
" [Main points from HMRC guidance]

**HMRC Requirements**
" [Specific regulatory requirements]

**Tax Implications**
" [Tax consequences and considerations]

**Sources**
" [Cite specific HMRC sections used]

Answer:"""

        self.prompt = PromptTemplate(
            template=prompt_template,
            input_variables=["context", "question"]
        )
        
        # Create RetrievalQA chain
        self.qa_chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",
            retriever=self.retriever,
            chain_type_kwargs={"prompt": self.prompt},
            return_source_documents=True
        )
    
    def ask_question(self, question: str) -> Dict[str, Any]:
        """
        Ask a question and get an answer with retrieved context.
        
        Args:
            question: The question to ask
            
        Returns:
            Dictionary containing answer, sources, and metadata
        """
        try:
            print(f"Processing question: {question}")
            
            # Get answer from QA chain
            result = self.qa_chain({"query": question})
            
            # Extract information
            answer = result["result"]
            source_documents = result["source_documents"]
            
            # Format response with citations
            formatted_response = self._format_response_with_citations(
                answer=answer,
                source_documents=source_documents,
                question=question
            )
            
            return formatted_response
            
        except Exception as e:
            print(f" Error processing question: {str(e)}")
            return {
                "answer": f"I apologize, but I encountered an error while processing your question: {str(e)}",
                "sources": [],
                "metadata": {
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                }
            }
    
    def _format_response_with_citations(self, 
                                      answer: str, 
                                      source_documents: List[Document],
                                      question: str) -> Dict[str, Any]:
        """Format the response with proper citations and metadata."""
        
        # Extract unique sources
        sources = []
        seen_sources = set()
        
        for doc in source_documents:
            source_url = doc.metadata.get('source_url', 'Unknown')
            section = doc.metadata.get('section', 'Unknown')
            
            source_key = f"{source_url}#{section}"
            if source_key not in seen_sources:
                sources.append({
                    'url': source_url,
                    'section': section,
                    'section_title': self._get_section_title(section),
                    'snippet': doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content
                })
                seen_sources.add(source_key)
        
        # Add source citations to answer if not already present
        if sources and "**Sources**" not in answer:
            answer += "\n\n**Sources**\n"
            for i, source in enumerate(sources, 1):
                answer += f"• {source['section_title']} - {source['url']}\n"
        
        return {
            "answer": answer.strip(),
            "sources": sources,
            "metadata": {
                "question": question,
                "num_sources": len(sources),
                "model_used": self.model_name,
                "timestamp": datetime.now().isoformat(),
                "retrieval_k": self.k
            }
        }
    
    def _get_section_title(self, section: str) -> str:
        """Convert section identifier to readable title."""
        section_titles = {
            "ersm110000_general_principles": "ERSM110000 - General Principles",
            "ersm20000_share_schemes": "ERSM20000 - Employment-related Securities and Options",
            "ersm30000_tax_implications": "ERSM30000 - Restricted Securities"
        }
        return section_titles.get(section, section)
    
    def search_similar_documents(self, query: str, k: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Search for similar documents without generating an answer.
        
        Args:
            query: Search query
            k: Number of documents to return (defaults to self.k)
            
        Returns:
            List of similar documents with metadata
        """
        try:
            search_k = k or self.k
            
            # Use vector store's similarity search with scores
            results = self.vector_store_manager.similarity_search_with_scores(query, k=search_k)
            
            formatted_results = []
            for doc, score in results:
                formatted_results.append({
                    'content': doc.page_content,
                    'score': score,
                    'metadata': doc.metadata,
                    'source_url': doc.metadata.get('source_url', 'Unknown'),
                    'section': doc.metadata.get('section', 'Unknown')
                })
            
            return formatted_results
            
        except Exception as e:
            print(f" Error searching documents: {str(e)}")
            return []
    
    def get_retriever_info(self) -> Dict[str, Any]:
        """Get information about the retriever configuration."""
        vector_info = self.vector_store_manager.get_collection_info()
        
        return {
            "ollama_url": self.ollama_base_url,
            "model_name": self.model_name,
            "retrieval_k": self.k,
            "vector_store_info": vector_info,
            "prompt_template": self.prompt.template if hasattr(self, 'prompt') else None
        }
    
    def test_connection(self) -> Dict[str, bool]:
        """Test connections to Ollama and vector store."""
        results = {
            "ollama_connected": False,
            "vector_store_loaded": False,
            "documents_available": False
        }
        
        try:
            # Test Ollama connection
            test_response = self.llm("Hello")
            results["ollama_connected"] = bool(test_response)
            print(" Ollama connection successful")
        except Exception as e:
            print(f" Ollama connection failed: {str(e)}")
        
        try:
            # Test vector store
            doc_count = self.vector_store_manager.get_document_count()
            results["vector_store_loaded"] = True
            results["documents_available"] = doc_count > 0
            print(f" Vector store loaded with {doc_count} documents")
        except Exception as e:
            print(f" Vector store test failed: {str(e)}")
        
        return results


def main():
    """Example usage of the HMRC RAG retriever."""
    
    try:
        # Initialize retriever
        retriever = HMRCRetriever()
        
        # Test connections
        print("\n=== Testing Connections ===")
        connections = retriever.test_connection()
        print(f"Connections: {connections}")
        
        if not all(connections.values()):
            print("Not all connections successful. Please check your setup.")
            return
        
        # Test questions
        test_questions = [
            "What are EMI schemes and what are the tax benefits?",
            "What are the tax implications when I exercise share options?",
            "What is the difference between approved and unapproved share schemes?",
            "How does Business Asset Disposal Relief work with EMI schemes?"
        ]
        
        print("\n=== Testing RAG Question Answering ===")
        
        for i, question in enumerate(test_questions, 1):
            print(f"\n--- Question {i} ---")
            print(f"Q: {question}")
            
            # Get answer
            response = retriever.ask_question(question)
            
            print(f"A: {response['answer']}")
            print(f"\nSources used: {len(response['sources'])}")
            
            for source in response['sources']:
                print(f"  - {source['section_title']}")
            
            print("-" * 80)
    
    except Exception as e:
        print(f"Error in main execution: {str(e)}")


if __name__ == "__main__":
    main()