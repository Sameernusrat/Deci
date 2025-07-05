#!/usr/bin/env python3
"""
Process a batch of important HMRC URLs from comprehensive discovery
"""
import json
from rag.document_loader import HMRCDocumentLoader

# Load the comprehensive URL discovery
with open('data/discovered_urls_20250701_081652.json', 'r') as f:
    discovery_data = json.load(f)

# Get URLs by depth - prioritize level 0 and 1 (most important sections)
level_0_urls = discovery_data['urls_by_depth']['0']  # Main index
level_1_urls = discovery_data['urls_by_depth']['1']  # Major sections

# Create a priority list of important URLs (first 100 most important)
priority_urls = level_0_urls + level_1_urls[:50]  # Main + 50 most important sections

print(f"📋 Processing {len(priority_urls)} priority HMRC URLs")
print(f"   • Level 0 (main): {len(level_0_urls)}")
print(f"   • Level 1 (sections): {min(50, len(level_1_urls))}")

# Initialize document loader
loader = HMRCDocumentLoader(max_pages=len(priority_urls))

try:
    # Load documents using priority URL list (skip discovery)
    documents = loader.load_documents(discover_links=False, url_list=priority_urls)
    
    if documents:
        # Split into chunks
        chunks = loader.split_documents(documents)
        
        # Save processed documents
        saved_path = loader.save_documents(chunks, "hmrc_priority_batch")
        
        print(f"\n🎉 Batch processing complete!")
        print(f"📊 Results:")
        print(f"   • URLs processed: {len(priority_urls)}")
        print(f"   • Documents loaded: {len(documents)}")
        print(f"   • Chunks created: {len(chunks)}")
        print(f"💾 Saved to: {saved_path}")
    else:
        print("❌ No documents loaded")

except Exception as e:
    print(f"❌ Error during batch processing: {str(e)}")