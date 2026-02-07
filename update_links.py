import os
import re
from pathlib import Path

# Configuration
SUPPORT_LINK = 'https://t.me/OMAR_M_SHEHATA'
CHANNEL_LINK = 'https://t.me/pandaadds'
ROOT_DIR = r'c:\Users\DELL\Desktop\public'

# Telegram links to replace (old incorrect links)
TELEGRAM_PATTERNS = [
    r'https://t\.me/Panda\s+Store_support',
    r'https://t\.me/Panda\s+Store',
    r'https://t\.me/PandaAdds',
    r'https://t\.me/pandastore_support',
    r'https://t\.me/pandastore',
    r'https://t\.me/OMAR_M_SHEHATA',
    r'https://t\.me/pandaadds',
]

def should_skip_file(filepath):
    """Check if file should be skipped."""
    # Skip the config.js file itself
    if 'config.js' in filepath:
        return True
    # Skip test files
    if 'test-' in filepath:
        return True
    return False

def add_config_script(content, filepath):
    """Add config.js script tag if not present."""
    # Check if already has config.js
    if 'config.js' in content:
        return content
    
    # Determine relative path to config.js based on file location
    file_path = Path(filepath)
    root_path = Path(ROOT_DIR)
    
    try:
        rel_path = file_path.relative_to(root_path)
        depth = len(rel_path.parts) - 1  # -1 for the file itself
        prefix = '../' * depth if depth > 0 else './'
    except ValueError:
        prefix = '/'
    
    config_script = f'  <script src="{prefix}js/config.js?v=2026"></script>\n'
    
    # Try to add after jQuery or other scripts, or before </head>
    if '<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>' in content:
        content = content.replace(
            '<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>',
            '<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>\n' + config_script
        )
    elif '</head>' in content:
        content = content.replace('</head>', config_script + '</head>')
    
    return content

def replace_telegram_links(content, filepath):
    """Replace hardcoded Telegram links with config variables."""
    modified = False
    
    # Pattern 1: href="..." - for support links
    # Look for support-related links
    support_patterns = [
        (r'href="\s*https://t\.me/OMAR_M_SHEHATA\s*"', 'href="" onclick="window.open(TELEGRAM_CONFIG.SUPPORT_LINK, \'_blank\'); return false;"'),
        (r'href="\s*https://t\.me/Panda\s+Store_support\s*"', 'href="" onclick="window.open(TELEGRAM_CONFIG.SUPPORT_LINK, \'_blank\'); return false;"'),
        (r'href="\s*https://t\.me/pandastore_support\s*"', 'href="" onclick="window.open(TELEGRAM_CONFIG.SUPPORT_LINK, \'_blank\'); return false;"'),
    ]
    
    channel_patterns = [
        (r'href="\s*https://t\.me/pandaadds\s*"', 'href="" onclick="window.open(TELEGRAM_CONFIG.CHANNEL_LINK, \'_blank\'); return false;"'),
        (r'href="\s*https://t\.me/PandaAdds\s*"', 'href="" onclick="window.open(TELEGRAM_CONFIG.CHANNEL_LINK, \'_blank\'); return false;"'),
        (r'href="\s*https://t\.me/Panda\s+Store\s*"', 'href="" onclick="window.open(TELEGRAM_CONFIG.CHANNEL_LINK, \'_blank\'); return false;"'),
        (r'href="\s*https://t\.me/pandastore\s*"', 'href="" onclick="window.open(TELEGRAM_CONFIG.CHANNEL_LINK, \'_blank\'); return false;"'),
    ]
    
    # Need to check context to determine if it's support or channel
    # For now, let's identify by id or class
    
    # Replace support links (those with support-link id or Support text)
    content = re.sub(
        r'(<a[^>]*id="support-link[^"]*"[^>]*href=")[^"]*(")',
        r'\1" onclick="window.open(TELEGRAM_CONFIG.SUPPORT_LINK, \'_blank\'); return false;\2',
        content
    )
    
    # Replace channel links (those with channel-link id or Channel text)  
    content = re.sub(
        r'(<a[^>]*id="channel-link[^"]*"[^>]*href=")[^"]*(")',
        r'\1" onclick="window.open(TELEGRAM_CONFIG.CHANNEL_LINK, \'_blank\'); return false;\2',
        content
    )
    
    # Replace window.open calls
    content = re.sub(
        r"window\.open\(\s*['\"]https://t\.me/OMAR_M_SHEHATA['\"]\s*,\s*['\"]_blank['\"]\s*\)",
        "window.open(TELEGRAM_CONFIG.CHANNEL_LINK, '_blank')",  # This is for popup notification
        content
    )
    
    # Fix footer links without IDs
    # This is tricky - we need smarter logic
    
    return content

def process_file(filepath):
    """Process a single HTML file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Add config script
        content = add_config_script(content, filepath)
        
        # Replace Telegram links
        content = replace_telegram_links(content, filepath)
        
        # Only write if changed
        if content != original_content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return False
    
    return False

def main():
    """Main function to process all HTML files."""
    html_files = list(Path(ROOT_DIR).rglob('*.html'))
    
    modified_count = 0
    skipped_count = 0
    
    for filepath in html_files:
        filepath_str = str(filepath)
        
        if should_skip_file(filepath_str):
            skipped_count += 1
            continue
        
        if process_file(filepath_str):
            modified_count += 1
            print(f"Modified: {filepath.relative_to(ROOT_DIR)}")
    
    print(f"\nSummary:")
    print(f"Total files found: {len(html_files)}")
    print(f"Files modified: {modified_count}")
    print(f"Files skipped: {skipped_count}")
    print(f"Files unchanged: {len(html_files) - modified_count - skipped_count}")

if __name__ == '__main__':
    main()
