#!/usr/bin/env python3
"""
Process a comprehensive batch of HMRC URLs (Level 0 + Level 1 + top Level 2)
"""
import json
from rag.document_loader import HMRCDocumentLoader

# Load the comprehensive URL discovery
with open('data/discovered_urls_20250701_081652.json', 'r') as f:
    discovery_data = json.load(f)

# Get URLs by depth - include more comprehensive coverage
level_0_urls = discovery_data['urls_by_depth']['0']  # Main index (1)
level_1_urls = discovery_data['urls_by_depth']['1']  # Major sections (25) 
level_2_urls = discovery_data['urls_by_depth']['2']  # Detailed sections (up to 150)

# Create comprehensive priority list (200 total URLs)
comprehensive_urls = level_0_urls + level_1_urls + level_2_urls[:150]

print(f"📋 Processing {len(comprehensive_urls)} comprehensive HMRC URLs")
print(f"   • Level 0 (main): {len(level_0_urls)}")
print(f"   • Level 1 (sections): {len(level_1_urls)}")
print(f"   • Level 2 (detailed): {min(150, len(level_2_urls))}")
print(f"   • Total URLs: {len(comprehensive_urls)}")

# Initialize document loader
loader = HMRCDocumentLoader(max_pages=len(comprehensive_urls))

try:
    # Load documents using comprehensive URL list (skip discovery)
    documents = loader.load_documents(discover_links=False, url_list=comprehensive_urls)
    
    if documents:
        # Split into chunks
        chunks = loader.split_documents(documents)
        
        # Save processed documents
        saved_path = loader.save_documents(chunks, "hmrc_comprehensive_batch")
        
        print(f"\n🎉 Comprehensive batch processing complete!")
        print(f"📊 Results:")
        print(f"   • URLs processed: {len(comprehensive_urls)}")
        print(f"   • Documents loaded: {len(documents)}")
        print(f"   • Chunks created: {len(chunks)}")
        print(f"💾 Saved to: {saved_path}")
        
        # Create properly named version for setup script
        import shutil
        timestamp = saved_path.split('_')[-1].split('.')[0]
        proper_name = f"data/hmrc_docs_comprehensive_{timestamp}.pkl"
        shutil.copy(saved_path, proper_name)
        print(f"📋 Also saved as: {proper_name}")
        
    else:
        print("❌ No documents loaded")

except Exception as e:
    print(f"❌ Error during comprehensive batch processing: {str(e)}")