#!/usr/bin/env python3
"""
Скрипт: Конвертация фото для h5.wanwukeyin.com.
Полностью очищает EXIF, ICC профили и метаданные.
Берет фото из папки `input` и сохраняет в папку `output`.
"""

import sys
import shutil
from pathlib import Path

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    from PIL import Image, ImageOps
except ImportError:
    print("❌ Ошибка: Не установлены необходимые библиотеки (Pillow, pillow-heif).")
    print("Пожалуйста, запустите скрипт через файл 'run.command', он всё установит автоматически.")
    sys.exit(1)

# === Настройки ===
MAX_LONG_SIDE = 3000       # Макс размер стороны
MAX_FILE_SIZE_MB = 2.5     # Макс вес файла
JPEG_QUALITY_START = 90
JPEG_QUALITY_MIN = 65

BASE_DIR = Path(__file__).parent.resolve()
INPUT_DIR = BASE_DIR / "input"
OUTPUT_DIR = BASE_DIR / "output"

ALL_IMAGE_EXTENSIONS = {'.heic', '.HEIC', '.jpg', '.jpeg', '.JPG', '.JPEG', '.png', '.PNG', '.bmp', '.webp'}

def convert_image(input_path, output_path):
    try:
        img = Image.open(input_path)
    except Exception as e:
        print(f"    ❌ Не удалось открыть: {e}")
        return False

    # Исправляем ориентацию ДО очистки EXIF
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # Конвертируем в RGB
    if img.mode in ('RGBA', 'LA', 'PA'):
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'PA':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    # Уменьшаем если нужно
    w, h = img.size
    long_side = max(w, h)
    if long_side > MAX_LONG_SIDE:
        ratio = MAX_LONG_SIDE / long_side
        new_w = int(w * ratio)
        new_h = int(h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        print(f"    📐 Уменьшено: {w}x{h} → {new_w}x{new_h}")

    # Создаём ЧИСТОЕ новое изображение без метаданных (важно для китайских сайтов)
    clean_img = Image.new('RGB', img.size)
    clean_img.putdata(list(img.getdata()))

    # Сохраняем с ограничением размера (БЕЗ EXIF, БЕЗ ICC)
    max_bytes = int(MAX_FILE_SIZE_MB * 1024 * 1024)
    quality = JPEG_QUALITY_START

    while quality >= JPEG_QUALITY_MIN:
        clean_img.save(output_path, "JPEG", quality=quality, optimize=True, icc_profile=None, exif=b'')
        file_size = output_path.stat().st_size
        if file_size <= max_bytes:
            break
        quality -= 5

    # Если всё ещё большой — уменьшаем разрешение
    cw, ch = clean_img.size
    while file_size > max_bytes and max(cw, ch) > 1200:
        cw = int(cw * 0.8)
        ch = int(ch * 0.8)
        smaller = clean_img.resize((cw, ch), Image.LANCZOS)
        smaller.save(output_path, "JPEG", quality=JPEG_QUALITY_MIN, optimize=True, icc_profile=None, exif=b'')
        file_size = output_path.stat().st_size
        print(f"    📐 Дополнительное уменьшение: {cw}x{ch}")

    final_w, final_h = clean_img.size if max(cw, ch) > 1200 else (cw, ch)
    size_mb = file_size / (1024 * 1024)
    print(f"    ✅ {output_path.name} ({final_w}x{final_h}, {size_mb:.1f} МБ)")
    return True

def main():
    INPUT_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    image_files = sorted([f for f in INPUT_DIR.iterdir() if f.is_file() and f.suffix in ALL_IMAGE_EXTENSIONS])

    print(f"\n{'=' * 60}")
    print(f"📸 WANWU PHOTO CONVERTER")
    print(f"{'=' * 60}")
    
    if not image_files:
        print(f"⚠️ Папка 'input' пуста!")
        print(f"Пожалуйста, положите фотографии в папку:\n{INPUT_DIR}\nи запустите программу снова.")
        return

    print(f"📁 Найдено файлов: {len(image_files)}")
    print(f"{'-' * 60}")

    # Очищаем папку output перед началом
    for f in OUTPUT_DIR.iterdir():
        if f.is_file():
            f.unlink()

    success = 0
    failed = 0

    for i, input_path in enumerate(image_files, 1):
        # Нумеруем с 1
        output_name = f"{i}.jpg"
        output_path = OUTPUT_DIR / output_name

        print(f"[{i}/{len(image_files)}] Обработка: {input_path.name}")

        if convert_image(input_path, output_path):
            success += 1
        else:
            failed += 1

    print(f"\n{'=' * 60}")
    print(f"✅ Готово! Успешно: {success}, Ошибок: {failed}")
    print(f"📂 Заберите готовые фотографии из папки:\n{OUTPUT_DIR}")
    print(f"{'=' * 60}\n")

if __name__ == "__main__":
    main()
