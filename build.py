"""Bundle index.html + assets into one self-contained file: python3 build.py"""
import re, base64
h = open('index.html').read()
css = open('assets/styles.css').read()
mark = 'data:image/png;base64,' + base64.b64encode(open('assets/logo-mark.png', 'rb').read()).decode()
h = h.replace('<link rel="stylesheet" href="assets/styles.css" />', '<style>\n' + css + '\n</style>')
h = h.replace('assets/logo-mark.png', mark)
h = re.sub(r'<script src="([^"]+)"></script>',
           lambda m: '<script>\n' + open(m.group(1)).read().replace('</script', '<\\/script') + '\n</script>', h)
assert 'src="assets' not in h and 'href="assets' not in h
open('Ambadnya-Invoice-Generator.html', 'w').write(h)
print('Built Ambadnya-Invoice-Generator.html', len(h) // 1024, 'KB')
