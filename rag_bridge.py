#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RAG Bridge Script for Node.js Integration
=========================================

This script provides a command-line interface to the HMRC RAG system
that can be called from Node.js backend.

Usage:
    python3 rag_bridge.py "What are EMI schemes?"
    
Returns JSON response with answer and sources.
"""

import sys
import json
import os
from typing import Dict, Any

# Add the rag directory to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), 'rag'))

try:
    from rag.retriever import HMRCRetriever
except ImportError as e:
    print(json.dumps({
        "error": f"Failed to import RAG modules: {str(e)}",
        "answer": "I'm having trouble accessing the HMRC knowledge base right now.",
        "sources": [],
        "rag_available": False
    }))
    sys.exit(1)


class RAGBridge:
    """Bridge between Node.js and Python RAG system."""
    
    def __init__(self):
        """Initialize RAG retriever."""
        self.retriever = None
        self.rag_available = False
        
        try:
            # Suppress output during initialization for JSON API
            import sys
            from io import StringIO
            old_stdout = sys.stdout
            old_stderr = sys.stderr
            sys.stdout = StringIO()
            sys.stderr = StringIO()
            
            try:
                self.retriever = HMRCRetriever(
                    vector_store_dir=".chromadb",
                    collection_name="hmrc_employment_securities"
                )
                
                # Test connection
                connections = self.retriever.test_connection()
                self.rag_available = all(connections.values())
            finally:
                # Restore output
                sys.stdout = old_stdout
                sys.stderr = old_stderr
            
        except Exception as e:
            self.rag_available = False
            self.error_message = str(e)
    
    def ask_question(self, question: str) -> Dict[str, Any]:
        """
        Ask a question using the RAG system.
        
        Args:
            question: User's question
            
        Returns:
            Dictionary with answer, sources, and metadata
        """
        if not self.rag_available or not self.retriever:
            return {
                "error": getattr(self, 'error_message', 'RAG system not available'),
                "answer": "I'm having trouble accessing the HMRC knowledge base right now. Let me try to help with general information.",
                "sources": [],
                "rag_available": False,
                "fallback_mode": True
            }
        
        try:
            # Suppress output during question processing for clean JSON
            import sys
            from io import StringIO
            old_stdout = sys.stdout
            old_stderr = sys.stderr
            sys.stdout = StringIO()
            sys.stderr = StringIO()
            
            try:
                # Get RAG response
                response = self.retriever.ask_question(question)
                
                # Format for Node.js consumption
                return {
                    "answer": response["answer"],
                    "sources": response["sources"],
                    "metadata": response["metadata"],
                    "rag_available": True,
                    "fallback_mode": False
                }
            finally:
                # Restore output
                sys.stdout = old_stdout
                sys.stderr = old_stderr
            
        except Exception as e:
            return {
                "error": str(e),
                "answer": "I encountered an error while searching the HMRC knowledge base. Let me try to help with general information.",
                "sources": [],
                "rag_available": False,
                "fallback_mode": True
            }
    
    def search_documents(self, query: str, k: int = 3) -> Dict[str, Any]:
        """
        Search for relevant documents without generating an answer.
        
        Args:
            query: Search query
            k: Number of documents to return
            
        Returns:
            Dictionary with search results
        """
        if not self.rag_available or not self.retriever:
            return {
                "error": "RAG system not available",
                "results": [],
                "rag_available": False
            }
        
        try:
            results = self.retriever.search_similar_documents(query, k)
            
            return {
                "results": results,
                "query": query,
                "count": len(results),
                "rag_available": True
            }
            
        except Exception as e:
            return {
                "error": str(e),
                "results": [],
                "rag_available": False
            }


def main():
    """Main CLI interface."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "No question provided",
            "usage": "python3 rag_bridge.py 'Your question here'",
            "rag_available": False
        }))
        sys.exit(1)
    
    question = sys.argv[1]
    
    # Initialize bridge
    bridge = RAGBridge()
    
    # Check for special commands
    if question.lower() == "status":
        status = {
            "rag_available": bridge.rag_available,
            "retriever_initialized": bridge.retriever is not None,
            "error": getattr(bridge, 'error_message', None) if not bridge.rag_available else None
        }
        print(json.dumps(status, indent=2))
        return
    
    elif question.lower().startswith("search:"):
        search_query = question[7:].strip()
        result = bridge.search_documents(search_query)
        print(json.dumps(result, indent=2))
        return
    
    # Normal question processing
    try:
        result = bridge.ask_question(question)
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        error_response = {
            "error": str(e),
            "answer": "I encountered an unexpected error while processing your question.",
            "sources": [],
            "rag_available": False
        }
        print(json.dumps(error_response, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()