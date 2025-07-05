import os
import json
import pickle
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from langchain_chroma import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain.schema import Document


class HMRCVectorStore:
    """Vector store for HMRC employment-related securities documents using Chroma and HuggingFace embeddings."""
    
    def __init__(self, 
                 persist_directory: str = ".chromadb",
                 embedding_model: str = "all-MiniLM-L6-v2",
                 collection_name: str = "hmrc_employment_securities"):
        """
        Initialize the vector store.
        
        Args:
            persist_directory: Directory to store the Chroma database
            embedding_model: HuggingFace embedding model name
            collection_name: Name of the Chroma collection
        """
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        
        # Initialize HuggingFace embeddings
        print(f"Loading embedding model: {embedding_model}")
        self.embeddings = HuggingFaceEmbeddings(
            model_name=embedding_model,
            model_kwargs={'device': 'cpu'},  # Use CPU for compatibility
            encode_kwargs={'normalize_embeddings': True}
        )
        
        # Ensure persist directory exists
        os.makedirs(persist_directory, exist_ok=True)
        
        # Initialize Chroma vector store
        self.vector_store = None
        self._initialize_vector_store()
    
    def _initialize_vector_store(self):
        """Initialize or load existing Chroma vector store."""
        try:
            self.vector_store = Chroma(
                collection_name=self.collection_name,
                embedding_function=self.embeddings,
                persist_directory=self.persist_directory
            )
            
            # Check if collection exists and has documents
            collection_count = self.get_document_count()
            if collection_count > 0:
                print(f" Connected to existing vector store with {collection_count} documents")
            else:
                print(" Initialized new empty vector store")
                
        except Exception as e:
            print(f" Error initializing vector store: {str(e)}")
            raise
    
    def load_documents_from_file(self, filepath: str) -> List[Document]:
        """Load processed documents from pickle file."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Document file not found: {filepath}")
        
        try:
            with open(filepath, 'rb') as f:
                documents = pickle.load(f)
            
            print(f" Loaded {len(documents)} documents from {filepath}")
            return documents
            
        except Exception as e:
            print(f" Error loading documents: {str(e)}")
            raise
    
    def find_latest_document_file(self, data_dir: str = "data") -> str:
        """Find the most recent HMRC document file in the data directory."""
        if not os.path.exists(data_dir):
            raise FileNotFoundError(f"Data directory not found: {data_dir}")
        
        # Look for HMRC document pickle files
        hmrc_files = [f for f in os.listdir(data_dir) if f.startswith('hmrc_docs_') and f.endswith('.pkl')]
        
        if not hmrc_files:
            raise FileNotFoundError(f"No HMRC document files found in {data_dir}")
        
        # Sort by filename (which includes timestamp) to get the latest
        latest_file = sorted(hmrc_files)[-1]
        filepath = os.path.join(data_dir, latest_file)
        
        print(f" Found latest document file: {latest_file}")
        return filepath
    
    def add_documents(self, documents: List[Document]) -> List[str]:
        """Add documents to the vector store."""
        if not documents:
            print("No documents to add")
            return []
        
        try:
            print(f"Adding {len(documents)} documents to vector store...")
            
            # Add documents to vector store
            doc_ids = self.vector_store.add_documents(documents)
            
            print(f" Successfully added {len(doc_ids)} documents")
            return doc_ids
            
        except Exception as e:
            print(f" Error adding documents: {str(e)}")
            raise
    
    def similarity_search(self, 
                         query: str, 
                         k: int = 5,
                         score_threshold: Optional[float] = None) -> List[Document]:
        """
        Search for similar documents.
        
        Args:
            query: Search query
            k: Number of results to return
            score_threshold: Minimum similarity score (optional)
            
        Returns:
            List of similar documents
        """
        try:
            if score_threshold is not None:
                # Use similarity search with score threshold
                results = self.vector_store.similarity_search_with_score(query, k=k)
                filtered_results = [doc for doc, score in results if score >= score_threshold]
                return filtered_results
            else:
                # Standard similarity search
                results = self.vector_store.similarity_search(query, k=k)
                return results
                
        except Exception as e:
            print(f" Error during similarity search: {str(e)}")
            raise
    
    def similarity_search_with_scores(self, 
                                    query: str, 
                                    k: int = 5) -> List[Tuple[Document, float]]:
        """
        Search for similar documents with similarity scores.
        
        Args:
            query: Search query
            k: Number of results to return
            
        Returns:
            List of (document, score) tuples
        """
        try:
            results = self.vector_store.similarity_search_with_score(query, k=k)
            return results
            
        except Exception as e:
            print(f" Error during similarity search with scores: {str(e)}")
            raise
    
    def get_document_count(self) -> int:
        """Get the total number of documents in the vector store."""
        try:
            # Get the underlying collection
            collection = self.vector_store._collection
            return collection.count()
            
        except Exception as e:
            print(f" Error getting document count: {str(e)}")
            return 0
    
    def delete_collection(self):
        """Delete the entire collection (use with caution)."""
        try:
            self.vector_store.delete_collection()
            print(f" Deleted collection: {self.collection_name}")
            
            # Reinitialize empty vector store
            self._initialize_vector_store()
            
        except Exception as e:
            print(f" Error deleting collection: {str(e)}")
            raise
    
    def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the current collection."""
        try:
            count = self.get_document_count()
            
            info = {
                'collection_name': self.collection_name,
                'persist_directory': self.persist_directory,
                'document_count': count,
                'embedding_model': self.embeddings.model_name,
                'created_at': datetime.now().isoformat()
            }
            
            return info
            
        except Exception as e:
            print(f" Error getting collection info: {str(e)}")
            return {}
    
    def save_collection_info(self, filepath: str = None):
        """Save collection information to a JSON file."""
        if filepath is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = os.path.join(self.persist_directory, f"collection_info_{timestamp}.json")
        
        try:
            info = self.get_collection_info()
            
            with open(filepath, 'w') as f:
                json.dump(info, f, indent=2)
            
            print(f" Collection info saved to: {filepath}")
            return filepath
            
        except Exception as e:
            print(f" Error saving collection info: {str(e)}")
            raise
    
    def setup_from_documents(self, data_dir: str = "data") -> int:
        """
        Complete setup: load latest documents and add to vector store.
        
        Args:
            data_dir: Directory containing processed documents
            
        Returns:
            Number of documents added
        """
        try:
            print("=== Setting up vector store from documents ===\n")
            
            # Find and load latest document file
            filepath = self.find_latest_document_file(data_dir)
            documents = self.load_documents_from_file(filepath)
            
            # Check if documents already exist
            current_count = self.get_document_count()
            if current_count > 0:
                print(f"Vector store already contains {current_count} documents")
                user_input = input("Do you want to add more documents (a) or recreate (r)? [a/r]: ").lower()
                
                if user_input == 'r':
                    print("Recreating vector store...")
                    self.delete_collection()
            
            # Add documents to vector store
            doc_ids = self.add_documents(documents)
            
            # Save collection info
            self.save_collection_info()
            
            print(f"\n=== Vector store setup complete ===")
            print(f"Added {len(doc_ids)} documents")
            print(f"Total documents in store: {self.get_document_count()}")
            
            return len(doc_ids)
            
        except Exception as e:
            print(f" Setup failed: {str(e)}")
            raise


def main():
    """Example usage of the HMRC vector store."""
    vector_store = HMRCVectorStore()
    
    try:
        # Setup vector store from documents
        added_count = vector_store.setup_from_documents()
        
        if added_count > 0:
            print(f"\n=== Testing similarity search ===")
            
            # Test queries
            test_queries = [
                "What are EMI schemes?",
                "tax implications of share options",
                "employment-related securities rules"
            ]
            
            for query in test_queries:
                print(f"\nQuery: '{query}'")
                results = vector_store.similarity_search_with_scores(query, k=3)
                
                for i, (doc, score) in enumerate(results):
                    print(f"  Result {i+1} (score: {score:.3f}):")
                    print(f"    Source: {doc.metadata.get('source_url', 'Unknown')}")
                    print(f"    Section: {doc.metadata.get('section', 'Unknown')}")
                    print(f"    Preview: {doc.page_content[:150]}...")
    
    except Exception as e:
        print(f"Error in main execution: {str(e)}")


if __name__ == "__main__":
    main()