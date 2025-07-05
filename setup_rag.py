#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HMRC RAG System Setup Script
============================

This script sets up the complete RAG (Retrieval-Augmented Generation) system for 
HMRC employment-related securities documentation.

Pipeline:
1. Load and process HMRC documents from web sources
2. Create vector embeddings and store in Chroma database  
3. Initialize and test the RAG retriever with Ollama

Usage:
    python3 setup_rag.py [options]

Requirements:
- Ollama running on localhost:11434 with llama3.2 model
- Internet connection for scraping HMRC documentation
- Required Python packages (langchain, chromadb, etc.)
"""

import os
import sys
import argparse
import time
from datetime import datetime
from typing import Dict, Any, Optional

# Add the rag directory to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), 'rag'))

try:
    from rag.document_loader import HMRCDocumentLoader
    from rag.vector_store import HMRCVectorStore
    from rag.retriever import HMRCRetriever
except ImportError as e:
    print(f"L Import error: {e}")
    print("Please ensure all RAG modules are in the rag/ directory")
    sys.exit(1)


class RAGSetupManager:
    """Manages the complete RAG system setup pipeline."""
    
    def __init__(self, 
                 data_dir: str = "data",
                 vector_store_dir: str = ".chromadb",
                 collection_name: str = "hmrc_employment_securities",
                 force_reload: bool = False,
                 test_queries: bool = True):
        """
        Initialize RAG setup manager.
        
        Args:
            data_dir: Directory for processed documents
            vector_store_dir: Directory for Chroma database
            collection_name: Name of the vector collection
            force_reload: Force reload of documents even if they exist
            test_queries: Run test queries after setup
        """
        self.data_dir = data_dir
        self.vector_store_dir = vector_store_dir
        self.collection_name = collection_name
        self.force_reload = force_reload
        self.test_queries = test_queries
        
        self.setup_start_time = datetime.now()
        self.steps_completed = []
        self.setup_info = {}
        
        # Create directories
        os.makedirs(data_dir, exist_ok=True)
        os.makedirs(vector_store_dir, exist_ok=True)
    
    def print_header(self):
        """Print setup header."""
        print("=" * 80)
        print("=� HMRC RAG SYSTEM SETUP")
        print("=" * 80)
        print(f"=� Started: {self.setup_start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"=� Data Directory: {self.data_dir}")
        print(f"=�  Vector Store: {self.vector_store_dir}")
        print(f"=� Collection: {self.collection_name}")
        print(f"= Force Reload: {self.force_reload}")
        print(f">� Test Queries: {self.test_queries}")
        print("=" * 80)
    
    def step_1_load_documents(self) -> bool:
        """Step 1: Load and process HMRC documents."""
        print("\n=� STEP 1: Loading HMRC Documents")
        print("-" * 50)
        
        try:
            # Check if documents already exist
            existing_files = []
            if os.path.exists(self.data_dir):
                existing_files = [f for f in os.listdir(self.data_dir) 
                                if f.startswith('hmrc_docs_') and f.endswith('.pkl')]
            
            if existing_files and not self.force_reload:
                latest_file = sorted(existing_files)[-1]
                print(f" Found existing documents: {latest_file}")
                print("   Use --force-reload to reload from web sources")
                
                self.setup_info['documents_file'] = os.path.join(self.data_dir, latest_file)
                self.setup_info['documents_reloaded'] = False
                self.steps_completed.append("load_documents")
                return True
            
            # Load documents from web
            print("< Loading documents from HMRC website...")
            loader = HMRCDocumentLoader(data_dir=self.data_dir)
            
            # Process all documents
            chunks = loader.process_all()
            
            if not chunks:
                print("L No documents were loaded successfully")
                return False
            
            # Find the saved file
            saved_files = [f for f in os.listdir(self.data_dir) 
                          if f.startswith('hmrc_docs_') and f.endswith('.pkl')]
            latest_file = sorted(saved_files)[-1]
            
            self.setup_info['documents_file'] = os.path.join(self.data_dir, latest_file)
            self.setup_info['documents_count'] = len(chunks)
            self.setup_info['documents_reloaded'] = True
            
            print(f" Successfully processed {len(chunks)} document chunks")
            print(f"=� Saved to: {latest_file}")
            
            self.steps_completed.append("load_documents")
            return True
            
        except Exception as e:
            print(f"L Document loading failed: {str(e)}")
            return False
    
    def step_2_create_vector_store(self) -> bool:
        """Step 2: Create vector store with embeddings."""
        print("\n>� STEP 2: Creating Vector Store")
        print("-" * 50)
        
        try:
            # Initialize vector store
            print("=' Initializing vector store...")
            vector_store = HMRCVectorStore(
                persist_directory=self.vector_store_dir,
                collection_name=self.collection_name
            )
            
            # Check if vector store already has documents
            existing_count = vector_store.get_document_count()
            
            if existing_count > 0 and not self.force_reload:
                print(f" Vector store already contains {existing_count} documents")
                print("   Use --force-reload to recreate vector store")
                
                self.setup_info['vector_store_created'] = False
                self.setup_info['vector_store_count'] = existing_count
                self.steps_completed.append("create_vector_store")
                return True
            
            # Load documents and create embeddings
            if existing_count > 0:
                print("=�  Deleting existing collection...")
                vector_store.delete_collection()
            
            print("=� Loading processed documents...")
            documents_file = self.setup_info.get('documents_file')
            if not documents_file or not os.path.exists(documents_file):
                # Try to find latest file
                documents_file = vector_store.find_latest_document_file(self.data_dir)
            
            documents = vector_store.load_documents_from_file(documents_file)
            
            print("= Creating embeddings and storing in vector database...")
            print("   This may take a few minutes...")
            
            doc_ids = vector_store.add_documents(documents)
            
            # Save collection info
            info_file = vector_store.save_collection_info()
            
            self.setup_info['vector_store_created'] = True
            self.setup_info['vector_store_count'] = len(doc_ids)
            self.setup_info['vector_store_info_file'] = info_file
            
            print(f" Successfully created vector store with {len(doc_ids)} documents")
            print(f"=� Collection info saved to: {os.path.basename(info_file)}")
            
            self.steps_completed.append("create_vector_store")
            return True
            
        except Exception as e:
            print(f"L Vector store creation failed: {str(e)}")
            return False
    
    def step_3_test_retriever(self) -> bool:
        """Step 3: Initialize and test the RAG retriever."""
        print("\n>� STEP 3: Testing RAG Retriever")
        print("-" * 50)
        
        try:
            # Initialize retriever
            print("=' Initializing RAG retriever...")
            retriever = HMRCRetriever(
                vector_store_dir=self.vector_store_dir,
                collection_name=self.collection_name
            )
            
            # Test connections
            print("= Testing connections...")
            connections = retriever.test_connection()
            
            if not all(connections.values()):
                print("L Connection tests failed:")
                for service, status in connections.items():
                    status_icon = "" if status else "L"
                    print(f"   {status_icon} {service}: {status}")
                return False
            
            print(" All connections successful")
            
            # Get retriever info
            info = retriever.get_retriever_info()
            self.setup_info['retriever_info'] = info
            
            if self.test_queries:
                print("\n<� Running test queries...")
                
                test_questions = [
                    "What are EMI schemes?",
                    "What are the tax implications of share options?",
                    "How do employment-related securities work?"
                ]
                
                for i, question in enumerate(test_questions, 1):
                    print(f"\n   Test {i}: {question}")
                    
                    start_time = time.time()
                    response = retriever.ask_question(question)
                    end_time = time.time()
                    
                    answer_preview = response['answer'][:150].replace('\n', ' ')
                    print(f"    Response ({end_time-start_time:.1f}s): {answer_preview}...")
                    print(f"   =� Sources: {len(response['sources'])}")
            
            self.setup_info['retriever_initialized'] = True
            self.steps_completed.append("test_retriever")
            
            print(f"\n RAG retriever is working correctly")
            return True
            
        except Exception as e:
            print(f"L Retriever testing failed: {str(e)}")
            return False
    
    def print_summary(self):
        """Print setup summary."""
        end_time = datetime.now()
        duration = end_time - self.setup_start_time
        
        print("\n" + "=" * 80)
        print("=� SETUP SUMMARY")
        print("=" * 80)
        
        # Status of each step
        all_steps = ["load_documents", "create_vector_store", "test_retriever"]
        for step in all_steps:
            status_icon = "" if step in self.steps_completed else "L"
            step_name = step.replace("_", " ").title()
            print(f"{status_icon} {step_name}")
        
        # Key information
        print(f"\n=� Setup Information:")
        if 'documents_count' in self.setup_info:
            print(f"   =� Documents processed: {self.setup_info['documents_count']}")
        if 'vector_store_count' in self.setup_info:
            print(f"   =�  Vector store documents: {self.setup_info['vector_store_count']}")
        
        print(f"\n�  Total time: {duration.total_seconds():.1f} seconds")
        print(f"=� Completed: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Next steps
        if len(self.steps_completed) == len(all_steps):
            print(f"\n<� RAG system is ready for use!")
            print(f"   =� Try: python3 rag/retriever.py")
            print(f"   =� Or integrate with your application")
        else:
            print(f"\n�  Setup incomplete. Please check errors above.")
        
        print("=" * 80)
    
    def run_setup(self) -> bool:
        """Run the complete setup pipeline."""
        self.print_header()
        
        # Step 1: Load documents
        if not self.step_1_load_documents():
            self.print_summary()
            return False
        
        # Step 2: Create vector store
        if not self.step_2_create_vector_store():
            self.print_summary()
            return False
        
        # Step 3: Test retriever
        if not self.step_3_test_retriever():
            self.print_summary()
            return False
        
        self.print_summary()
        return True


def main():
    """Main setup function with command line arguments."""
    parser = argparse.ArgumentParser(
        description="Setup HMRC RAG system",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 setup_rag.py                    # Standard setup
  python3 setup_rag.py --force-reload     # Force reload all data
  python3 setup_rag.py --no-test          # Skip test queries
  python3 setup_rag.py --data-dir ./docs  # Custom data directory
        """
    )
    
    parser.add_argument(
        '--data-dir',
        default='data',
        help='Directory for processed documents (default: data)'
    )
    
    parser.add_argument(
        '--vector-store-dir',
        default='.chromadb',
        help='Directory for Chroma database (default: .chromadb)'
    )
    
    parser.add_argument(
        '--collection-name',
        default='hmrc_employment_securities',
        help='Vector store collection name (default: hmrc_employment_securities)'
    )
    
    parser.add_argument(
        '--force-reload',
        action='store_true',
        help='Force reload documents and recreate vector store'
    )
    
    parser.add_argument(
        '--no-test',
        action='store_true',
        help='Skip test queries after setup'
    )
    
    args = parser.parse_args()
    
    # Create and run setup manager
    setup_manager = RAGSetupManager(
        data_dir=args.data_dir,
        vector_store_dir=args.vector_store_dir,
        collection_name=args.collection_name,
        force_reload=args.force_reload,
        test_queries=not args.no_test
    )
    
    success = setup_manager.run_setup()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()