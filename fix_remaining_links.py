import os
import re
from pathlib import Path

ROOT_DIR = r'c:\Users\DELL\Desktop\public'

def process_file(filepath):
    """Process a single HTML file to fix remaining links."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Fix specific patterns for pandaadds links that should be interactive
        # These are navigation/footer links, not content links
        patterns = [
            # Fix pandaadds links in navigation/footer
            (r'<a href="https://t\.me/pandaadds" style="color: #ffd76a;">@PandaAdds</a>',
             r'<a href="javascript:void(0);" onclick="openChannelLink()" style="color: #ffd76a;">@PandaAdds</a>'),
            
            # Fix in list items (navigation)
            (r'<li>قناتنا: <a href="https://t\.me/pandaadds" style="color: #ffd76a;">@PandaAdds</a></li>',
             r'<li>قناتنا: <a href="javascript:void(0);" onclick="openChannelLink()" style="color: #ffd76a;">@PandaAdds</a></li>'),
        ]
        
        for pattern, replacement in patterns:
            content = re.sub(pattern, replacement, content)
        
        # Save if changed
        if content != original_content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return False
    
    return False

def main():
    """Process specific files."""
    files_to_fix = [
        r'c:\Users\DELL\Desktop\public\ar\privacy-policy.html',
        r'c:\Users\DELL\Desktop\public\ar\terms-of-use.html',
    ]
    
    modified = 0
    for filepath in files_to_fix:
        if os.path.exists(filepath):
            if process_file(filepath):
                print(f"✓ {os.path.basename(filepath)}")
                modified += 1
        else:
            print(f"✗ File not found: {filepath}")
    
    print(f"\nModified {modified} file(s)")

if __name__ == '__main__':
    main()
