import os
import json
import pickle
import re
import time
from typing import List, Dict, Any, Set
from datetime import datetime
from urllib.parse import urljoin, urlparse

from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.schema import Document


class HMRCDocumentLoader:
    """Enhanced HMRC document loader that follows internal links to build comprehensive knowledge base."""
    
    def __init__(self, data_dir: str = "data", max_depth: int = 2, max_pages: int = 50):
        self.data_dir = data_dir
        self.max_depth = max_depth
        self.max_pages = max_pages
        
        # Starting URLs for HMRC employment-related securities
        self.seed_urls = [
            "https://www.gov.uk/hmrc-internal-manuals/employment-related-securities/ersm110000",
            "https://www.gov.uk/hmrc-internal-manuals/employment-related-securities/ersm20000", 
            "https://www.gov.uk/hmrc-internal-manuals/employment-related-securities/ersm30000"
        ]
        
        # Track discovered URLs and their depth
        self.discovered_urls: Dict[str, int] = {}
        self.processed_urls: Set[str] = set()
        self.failed_urls: List[Dict[str, Any]] = []
        
        # Text splitter configuration
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", " ", ""]
        )
        
        # Request headers
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        # Initialize seed URLs at depth 0
        for url in self.seed_urls:
            self.discovered_urls[url] = 0
        
        # Ensure data directory exists
        os.makedirs(self.data_dir, exist_ok=True)
    
    def extract_hmrc_links(self, html_content: str, base_url: str) -> Set[str]:
        """Extract internal HMRC links from HTML content."""
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            print("❌ BeautifulSoup not available. Install with: pip install beautifulsoup4")
            return set()
        
        soup = BeautifulSoup(html_content, 'html.parser')
        links = set()
        
        # Find all links
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Convert relative URLs to absolute
            full_url = urljoin(base_url, href)
            
            # Only include HMRC employment-related securities links
            if self._is_relevant_hmrc_link(full_url):
                links.add(full_url)
        
        return links
    
    def _is_relevant_hmrc_link(self, url: str) -> bool:
        """Check if URL is a relevant HMRC employment-related securities link."""
        # Must be gov.uk domain
        if 'gov.uk' not in url:
            return False
        
        # Must be HMRC internal manual
        if '/hmrc-internal-manuals/' not in url:
            return False
        
        # Must be employment-related securities or related topics
        relevant_patterns = [
            '/employment-related-securities/',
            '/ersm',  # Employment-Related Securities Manual
            '/capital-gains-manual/',
            '/income-tax-manual/',
            '/share-schemes',
            '/emi-',
            '/csop',
            '/saye'
        ]
        
        return any(pattern in url.lower() for pattern in relevant_patterns)
    
    def discover_links(self, max_depth: int = None) -> None:
        """Discover internal HMRC links recursively."""
        if max_depth is None:
            max_depth = self.max_depth
        
        try:
            import requests
        except ImportError:
            print("❌ Requests not available. Install with: pip install requests")
            return
        
        print(f"🔍 Discovering HMRC links (max depth: {max_depth}, max pages: {self.max_pages})...")
        
        for depth in range(max_depth + 1):
            if len(self.discovered_urls) >= self.max_pages:
                print(f"🛑 Reached maximum pages limit ({self.max_pages})")
                break
            
            # Get URLs at current depth that haven't been processed
            urls_at_depth = [
                url for url, url_depth in self.discovered_urls.items() 
                if url_depth == depth and url not in self.processed_urls
            ]
            
            if not urls_at_depth:
                print(f"📄 No more URLs at depth {depth}")
                continue
            
            print(f"🌐 Processing {len(urls_at_depth)} URLs at depth {depth}...")
            
            for url in urls_at_depth:
                if len(self.discovered_urls) >= self.max_pages:
                    break
                
                try:
                    print(f"  🔗 Discovering links from: {url}")
                    
                    # Fetch the page
                    response = requests.get(url, headers=self.headers, timeout=30)
                    response.raise_for_status()
                    
                    # Extract links
                    new_links = self.extract_hmrc_links(response.text, url)
                    
                    # Add new links at next depth
                    new_count = 0
                    for link in new_links:
                        if (link not in self.discovered_urls and 
                            len(self.discovered_urls) < self.max_pages):
                            self.discovered_urls[link] = depth + 1
                            new_count += 1
                    
                    print(f"    ✓ Found {new_count} new links")
                    
                    # Mark as processed
                    self.processed_urls.add(url)
                    
                    # Rate limiting
                    time.sleep(1)
                    
                except Exception as e:
                    print(f"    ✗ Error discovering links from {url}: {str(e)}")
                    self.failed_urls.append({
                        'url': url,
                        'error': str(e),
                        'stage': 'link_discovery'
                    })
                    self.processed_urls.add(url)
        
        print(f"\n🎯 Discovery complete: {len(self.discovered_urls)} total URLs found")
        
        # Save discovered URLs
        self._save_discovered_urls()
    
    def load_documents(self, discover_links: bool = True) -> List[Document]:
        """Load documents from HMRC URLs with optional link discovery."""
        if discover_links:
            self.discover_links()
        
        all_documents = []
        total_urls = len(self.discovered_urls)
        
        print(f"\n📚 Loading documents from {total_urls} discovered HMRC URLs...")
        
        for i, (url, depth) in enumerate(self.discovered_urls.items(), 1):
            try:
                print(f"📄 [{i}/{total_urls}] Loading (depth {depth}): {url}")
                
                # Use WebBaseLoader to scrape the URL
                loader = WebBaseLoader(
                    web_paths=[url],
                    header_template=self.headers
                )
                
                # Load the document
                docs = loader.load()
                
                # Add metadata to each document
                for doc in docs:
                    doc.metadata.update({
                        'source_url': url,
                        'loaded_at': datetime.now().isoformat(),
                        'document_type': 'hmrc_employment_securities',
                        'section': self._extract_section_from_url(url),
                        'discovery_depth': depth,
                        'page_title': self._extract_page_title(doc.page_content)
                    })
                
                all_documents.extend(docs)
                print(f"    ✓ Successfully loaded {len(docs)} document(s)")
                
                # Rate limiting
                time.sleep(0.5)
                
            except Exception as e:
                print(f"    ✗ Failed to load {url}: {str(e)}")
                self.failed_urls.append({
                    'url': url, 
                    'error': str(e),
                    'stage': 'document_loading',
                    'depth': depth
                })
                continue
        
        if self.failed_urls:
            print(f"\n⚠️  Failed to load {len(self.failed_urls)} URLs")
            self._save_failed_urls(self.failed_urls)
        
        print(f"\n✅ Total documents loaded: {len(all_documents)}")
        print(f"📊 Coverage: {len(all_documents)} docs from {len(self.discovered_urls)} URLs")
        
        return all_documents
    
    def split_documents(self, documents: List[Document]) -> List[Document]:
        """Split documents into chunks using RecursiveCharacterTextSplitter."""
        print("🔪 Splitting documents into chunks...")
        
        try:
            chunks = self.text_splitter.split_documents(documents)
            
            # Add chunk metadata
            for i, chunk in enumerate(chunks):
                chunk.metadata.update({
                    'chunk_id': i,
                    'chunk_size': len(chunk.page_content),
                    'processed_at': datetime.now().isoformat()
                })
            
            print(f"✓ Split into {len(chunks)} chunks")
            return chunks
            
        except Exception as e:
            print(f"✗ Error splitting documents: {str(e)}")
            raise
    
    def save_documents(self, documents: List[Document], filename: str = None) -> str:
        """Save processed documents to the data folder."""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"hmrc_docs_enhanced_{timestamp}"
        
        try:
            # Save as pickle for easy loading with metadata
            pickle_path = os.path.join(self.data_dir, f"{filename}.pkl")
            with open(pickle_path, 'wb') as f:
                pickle.dump(documents, f)
            
            # Save as JSON for human readability
            json_path = os.path.join(self.data_dir, f"{filename}.json")
            json_data = []
            for doc in documents:
                json_data.append({
                    'content': doc.page_content,
                    'metadata': doc.metadata
                })
            
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)
            
            # Save summary information
            summary_path = os.path.join(self.data_dir, f"{filename}_summary.json")
            
            # Calculate statistics
            depth_stats = {}
            section_stats = {}
            for doc in documents:
                depth = doc.metadata.get('discovery_depth', 0)
                section = doc.metadata.get('section', 'unknown')
                depth_stats[depth] = depth_stats.get(depth, 0) + 1
                section_stats[section] = section_stats.get(section, 0) + 1
            
            summary = {
                'total_documents': len(documents),
                'total_characters': sum(len(doc.page_content) for doc in documents),
                'average_chunk_size': sum(len(doc.page_content) for doc in documents) / len(documents) if documents else 0,
                'source_urls_count': len(set(doc.metadata.get('source_url', '') for doc in documents)),
                'unique_sections': len(section_stats),
                'depth_distribution': depth_stats,
                'section_distribution': section_stats,
                'discovery_stats': {
                    'max_depth': self.max_depth,
                    'max_pages': self.max_pages,
                    'total_discovered_urls': len(self.discovered_urls),
                    'failed_urls': len(self.failed_urls)
                },
                'created_at': datetime.now().isoformat(),
                'files': {
                    'pickle': pickle_path,
                    'json': json_path,
                    'summary': summary_path
                }
            }
            
            with open(summary_path, 'w') as f:
                json.dump(summary, f, indent=2)
            
            print(f"✓ Documents saved:")
            print(f"  - Pickle: {pickle_path}")
            print(f"  - JSON: {json_path}")
            print(f"  - Summary: {summary_path}")
            
            return pickle_path
            
        except Exception as e:
            print(f"✗ Error saving documents: {str(e)}")
            raise
    
    def load_saved_documents(self, filename: str) -> List[Document]:
        """Load previously saved documents from pickle file."""
        pickle_path = os.path.join(self.data_dir, f"{filename}.pkl")
        
        if not os.path.exists(pickle_path):
            raise FileNotFoundError(f"No saved documents found at {pickle_path}")
        
        try:
            with open(pickle_path, 'rb') as f:
                documents = pickle.load(f)
            
            print(f"✓ Loaded {len(documents)} documents from {pickle_path}")
            return documents
            
        except Exception as e:
            print(f"✗ Error loading saved documents: {str(e)}")
            raise
    
    def process_all(self, save_filename: str = None, discover_links: bool = True) -> List[Document]:
        """Complete pipeline: discover links, load, split, and save documents."""
        print("🚀 === HMRC Document Processing Pipeline (Enhanced) ===")
        print(f"📋 Configuration:")
        print(f"   • Max depth: {self.max_depth}")
        print(f"   • Max pages: {self.max_pages}")
        print(f"   • Link discovery: {discover_links}")
        print(f"   • Seed URLs: {len(self.seed_urls)}")
        
        try:
            # Load documents (with optional link discovery)
            documents = self.load_documents(discover_links=discover_links)
            
            if not documents:
                print("❌ No documents loaded successfully.")
                return []
            
            # Split into chunks
            chunks = self.split_documents(documents)
            
            # Save processed documents
            saved_path = self.save_documents(chunks, save_filename)
            
            print(f"\n🎉 === Processing Complete ===")
            print(f"📊 Statistics:")
            print(f"   • Source URLs discovered: {len(self.discovered_urls)}")
            print(f"   • Documents loaded: {len(documents)}")
            print(f"   • Chunks created: {len(chunks)}")
            print(f"   • Failed URLs: {len(self.failed_urls)}")
            print(f"💾 Documents saved to: {saved_path}")
            
            # Print depth distribution
            depth_stats = {}
            for url, depth in self.discovered_urls.items():
                depth_stats[depth] = depth_stats.get(depth, 0) + 1
            
            print(f"\n🌳 URL Distribution by Depth:")
            for depth in sorted(depth_stats.keys()):
                print(f"   • Depth {depth}: {depth_stats[depth]} URLs")
            
            return chunks
            
        except Exception as e:
            print(f"❌ Pipeline failed: {str(e)}")
            raise
    
    def _extract_section_from_url(self, url: str) -> str:
        """Extract section identifier from HMRC URL."""
        # Extract the specific section code from URL
        if '/ersm' in url:
            # Try to extract ERSM code (e.g., ersm110000, ersm20020, etc.)
            match = re.search(r'/ersm(\d+)', url)
            if match:
                code = match.group(1)
                return f'ersm{code}'
        
        # Legacy mappings for broader categories
        if 'ersm110000' in url or 'ersm11' in url:
            return 'ersm110000_general_principles'
        elif 'ersm20000' in url or 'ersm2' in url:
            return 'ersm20000_share_schemes'
        elif 'ersm30000' in url or 'ersm3' in url:
            return 'ersm30000_tax_implications'
        elif 'capital-gains' in url:
            return 'capital_gains_manual'
        elif 'income-tax' in url:
            return 'income_tax_manual'
        elif 'share-schemes' in url:
            return 'share_schemes'
        else:
            # Extract from URL path
            path_parts = url.split('/')[-2:]
            return '_'.join(part for part in path_parts if part)
    
    def _extract_page_title(self, content: str) -> str:
        """Extract page title from document content."""
        lines = content.split('\n')[:10]  # Check first 10 lines
        for line in lines:
            line = line.strip()
            if line and len(line) > 10 and len(line) < 200:
                # Remove common prefixes
                for prefix in ['ERSM', 'Employment-related securities', 'HMRC internal manual']:
                    if line.startswith(prefix):
                        line = line[len(prefix):].strip(' -:')
                if line:
                    return line
        return 'Unknown'
    
    def _save_discovered_urls(self) -> None:
        """Save discovered URLs information."""
        discovered_path = os.path.join(self.data_dir, f"discovered_urls_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        
        try:
            discovery_info = {
                'discovered_at': datetime.now().isoformat(),
                'total_urls': len(self.discovered_urls),
                'max_depth': self.max_depth,
                'max_pages': self.max_pages,
                'urls_by_depth': {},
                'all_urls': self.discovered_urls
            }
            
            # Group URLs by depth
            for url, depth in self.discovered_urls.items():
                if str(depth) not in discovery_info['urls_by_depth']:
                    discovery_info['urls_by_depth'][str(depth)] = []
                discovery_info['urls_by_depth'][str(depth)].append(url)
            
            with open(discovered_path, 'w') as f:
                json.dump(discovery_info, f, indent=2)
            
            print(f"📝 Discovered URLs saved to: {discovered_path}")
            
        except Exception as e:
            print(f"Could not save discovered URLs: {str(e)}")
    
    def _save_failed_urls(self, failed_urls: List[Dict[str, Any]]) -> None:
        """Save information about failed URL loads."""
        failed_path = os.path.join(self.data_dir, f"failed_urls_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        
        try:
            with open(failed_path, 'w') as f:
                json.dump({
                    'failed_at': datetime.now().isoformat(),
                    'failed_count': len(failed_urls),
                    'failed_urls': failed_urls
                }, f, indent=2)
            
            print(f"❌ Failed URL information saved to: {failed_path}")
            
        except Exception as e:
            print(f"Could not save failed URLs info: {str(e)}")


def main():
    """Example usage of the enhanced HMRC document loader."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Enhanced HMRC Document Loader')
    parser.add_argument('--max-depth', type=int, default=2, help='Maximum crawling depth')
    parser.add_argument('--max-pages', type=int, default=50, help='Maximum pages to crawl')
    parser.add_argument('--no-discovery', action='store_true', help='Disable link discovery')
    parser.add_argument('--data-dir', default='data', help='Data directory')
    
    args = parser.parse_args()
    
    # Check dependencies
    try:
        from bs4 import BeautifulSoup
        import requests
    except ImportError:
        print("❌ Missing required packages. Install with:")
        print("   pip install beautifulsoup4 requests")
        return
    
    loader = HMRCDocumentLoader(
        data_dir=args.data_dir,
        max_depth=args.max_depth,
        max_pages=args.max_pages
    )
    
    try:
        # Process all documents
        chunks = loader.process_all(discover_links=not args.no_discovery)
        
        # Display some sample chunks
        if chunks:
            print(f"\n📋 === Sample Chunks ===")
            for i, chunk in enumerate(chunks[:3]):
                print(f"\n🔸 Chunk {i+1}:")
                print(f"   📄 Source: {chunk.metadata.get('source_url', 'Unknown')}")
                print(f"   🏷️  Section: {chunk.metadata.get('section', 'Unknown')}")
                print(f"   📏 Size: {len(chunk.page_content)} characters")
                print(f"   🌊 Depth: {chunk.metadata.get('discovery_depth', 'N/A')}")
                print(f"   📰 Title: {chunk.metadata.get('page_title', 'Unknown')}")
                print(f"   📝 Preview: {chunk.page_content[:200]}...")
                
        print(f"\n✅ Enhanced document loading complete!")
        print(f"🔗 Ready to rebuild vector store with expanded knowledge base")
    
    except Exception as e:
        print(f"❌ Error in main execution: {str(e)}")


if __name__ == "__main__":
    main()