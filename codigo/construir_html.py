"""Construye el HTML autónomo de AYLEN desde index.html, sin cambiar los datos."""
import json
import re
from pathlib import Path

base = Path(__file__).resolve().parent.parent
page = (base / 'index.html').read_text(encoding='utf-8')
manifest = json.loads((base / 'datos/inventario.json').read_text(encoding='utf-8'))

def local_file(name):
    path = (base / name).resolve()
    if not path.is_relative_to(base) or not path.is_file():
        raise ValueError('Dependencia local inexistente o fuera del proyecto: ' + name)
    return path

def stylesheet(match):
    name = match.group(1)
    css = local_file(name).read_text(encoding='utf-8')
    return '<style data-aylen-source="' + name + '">' + css + '</style>'

def javascript(match):
    name = match.group(1)
    code = local_file(name).read_text(encoding='utf-8')
    if name == 'datos/catalogo.js':
        code += '\n' + '\n'.join(
            local_file('datos/' + month + '.js').read_text(encoding='utf-8')
            for month in manifest['meses']
        )
    code = re.sub(r'</script', r'<\\/script', code, flags=re.IGNORECASE)
    return '<script data-aylen-source="' + name + '">' + code + '</script>'

# Respetar el orden de index.html conserva idioma, adaptación y ayudas.
page = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>', stylesheet, page)
page = re.sub(r'<script\s+src="([^"]+)"\s*></script>', javascript, page)
if re.search(r'<script\s+src=|<link\s+rel="stylesheet"', page):
    raise ValueError('Quedaron scripts o estilos sin incorporar.')

output = base / 'AYLEN-v9.html'
output.write_text(page, encoding='utf-8')
print('AYLEN v9: HTML autónomo actualizado —', output.stat().st_size, 'bytes')
