"""#FR-73: копирование чистой версии модуля радона контура «Радоновый риск» в публичный снимок — без правок, с сверкой sha256."""
import hashlib, pathlib, re

FILES = ("radonRisk.mjs", "coefficients.json", "README.md", "SPEC.md", "LICENSE")
FORBIDDEN = re.compile("|".join(["Google" "Drive", "Claude" "_files", "books" "-library", "Ver" "ter", r"[A-Za-z]:\\"]).encode("ascii"))
DEST = ("src", "vendor", "radon_risk")

class RadonPublishError(Exception): pass

def copy_radon(out_dir, publish_dir):
    # Проверка наличия исходных файлов
    for n in FILES:
        if not (publish_dir / n).is_file():
            raise RadonPublishError(f"нет файла версии для публикации: {publish_dir / n}")
    
    # Чтение и проверка на запрещенные паттерны
    data_map = {}
    for n in FILES:
        data = (publish_dir / n).read_bytes()
        if FORBIDDEN.search(data):
            raise RadonPublishError(f"в {n} найдены локальные пути или личные имена")
        data_map[n] = data
        
    # Создание целевой директории
    dest_dir = out_dir / pathlib.Path(*DEST)
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    # Копирование и сверка хешей
    written = []
    for n in FILES:
        target = dest_dir / n
        target.write_bytes(data_map[n])
        if hashlib.sha256(target.read_bytes()).hexdigest() != hashlib.sha256(data_map[n]).hexdigest():
            raise RadonPublishError(f"sha256 не совпал после копирования: {n}")
        written.append(f"{'/'.join(DEST)}/{n}")
        
    # Формирование файла контрольных сумм
    lines = []
    for n in FILES:
        digest = hashlib.sha256(data_map[n]).hexdigest()
        lines.append(f"{digest}  {n}\n")
    (dest_dir / "SHA256.txt").write_bytes("".join(lines).encode("utf-8"))
    written.append(f"{'/'.join(DEST)}/SHA256.txt")
    
    return written
