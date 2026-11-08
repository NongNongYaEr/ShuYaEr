const MAX_SOURCE_EDGE = 8192;
const MAX_IMAGE_PIXELS = 2048 * 2048;
const TOTAL_PREVIEW_PIXELS = 8 * MAX_IMAGE_PIXELS;
const bitmapOptions = {premultiplyAlpha:'none',colorSpaceConversion:'none'};
const sourceBlobs = new WeakMap();

function checkDimensions(width,height) {
  if (Math.max(width,height) > MAX_SOURCE_EDGE) throw Error('花盆贴图单边请控制在 8192 像素以内。');
}

function imageHeader(buffer) {
  const bytes = new DataView(buffer);
  if (bytes.byteLength >= 24 && bytes.getUint32(0) === 0x89504e47 && bytes.getUint32(4) === 0x0d0a1a0a) {
    return {width:bytes.getUint32(16),height:bytes.getUint32(20),mime:'image/png'};
  }
  if (bytes.byteLength >= 12 && bytes.getUint16(0) === 0xffd8) {
    let hasExif = false;
    for (let at = 2; at + 3 < bytes.byteLength;) {
      if (bytes.getUint8(at++) !== 0xff) break;
      while (at < bytes.byteLength && bytes.getUint8(at) === 0xff) at++;
      if (at + 2 >= bytes.byteLength) break;
      const marker = bytes.getUint8(at++);
      if (marker === 0xd9 || marker === 0xda) break;
      const length = bytes.getUint16(at);
      if (length < 2 || at + length > bytes.byteLength) break;
      if (marker === 0xe1 && length >= 8 && bytes.getUint32(at + 2) === 0x45786966) hasExif = true;
      // SOF markers carry dimensions. DHT, JPG, and DAC share the range.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4,0xc8,0xcc].includes(marker) && length >= 8) {
        return {width:bytes.getUint16(at + 5),height:bytes.getUint16(at + 3),mime:'image/jpeg',hasExif};
      }
      at += length;
    }
  }
  if (bytes.byteLength >= 30 && bytes.getUint32(0) === 0x52494646 && bytes.getUint32(8) === 0x57454250) {
    const chunk = bytes.getUint32(12);
    const uint24 = at => bytes.getUint16(at,true) + (bytes.getUint8(at + 2) << 16);
    if (chunk === 0x56503858) return {width:1 + uint24(24),height:1 + uint24(27),mime:'image/webp'};
    if (chunk === 0x5650384c && bytes.getUint8(20) === 0x2f) {
      const size = bytes.getUint32(21,true);
      return {width:1 + (size & 0x3fff),height:1 + ((size >>> 14) & 0x3fff),mime:'image/webp'};
    }
    if (chunk === 0x56503820 && bytes.getUint16(23) === 0x9d01 && bytes.getUint8(25) === 0x2a) {
      return {width:bytes.getUint16(26,true) & 0x3fff,height:bytes.getUint16(28,true) & 0x3fff,mime:'image/webp'};
    }
  }
  return null;
}

function resizeOptions(width,height,maxPixels) {
  if (width * height <= maxPixels) return bitmapOptions;
  const scale = Math.sqrt(maxPixels / (width * height));
  return {...bitmapOptions,resizeWidth:Math.min(maxPixels,Math.max(1,Math.floor(width * scale))),
    resizeHeight:Math.min(maxPixels,Math.max(1,Math.floor(height * scale))),resizeQuality:'high'};
}

export async function decodePreview(blob,maxPixels) {
  let header = imageHeader(await blob.slice(0,256 * 1024).arrayBuffer());
  if (!header && blob.type === 'image/jpeg' && blob.size > 256 * 1024) header = imageHeader(await blob.arrayBuffer());
  if (header) checkDimensions(header.width,header.height);
  // EXIF can swap the display width and height. Resize its oriented bitmap.
  if (header && (!header.hasExif || header.width === header.height)) {
    const options = resizeOptions(header.width,header.height,maxPixels);
    const bitmap = await createImageBitmap(blob,options);
    return {bitmap,mime:header.mime,reduced:options !== bitmapOptions};
  }
  const source = await createImageBitmap(blob,bitmapOptions);
  try {
    checkDimensions(source.width,source.height);
    const options = resizeOptions(source.width,source.height,maxPixels);
    if (options === bitmapOptions) return {bitmap:source,mime:header?.mime || blob.type};
    const bitmap = await createImageBitmap(source,options);
    source.close();
    return {bitmap,mime:header?.mime || blob.type,reduced:true};
  } catch (error) {
    source.close();
    throw error;
  }
}

export function createPotImagePreview(loader,manager) {
  const decoded = new Set();
  let queue = Promise.resolve(), failure, finished = false, reduced = false;
  if (typeof createImageBitmap === 'function') loader.register(parser => {
    const count = Math.max(1,parser.json.images?.length ?? 0);
    const maxPixels = Math.max(1,Math.min(MAX_IMAGE_PIXELS,Math.floor(TOTAL_PREVIEW_PIXELS / count)));
    parser.textureLoader = {isImageBitmapLoader:true,load(url,onLoad,_,onError) {
      // GLTFLoader requests every image together. Decode only one at a time.
      queue = queue.then(async () => {
        if (finished || failure) throw failure || Error('花盆贴图读取已结束。');
        const response = await fetch(manager.resolveURL(url));
        if (!response.ok) throw Error('无法读取花盆内嵌贴图。');
        const blob = await response.blob();
        const preview = await decodePreview(blob,maxPixels);
        const {bitmap,mime} = preview;
        if (finished) { bitmap.close(); throw Error('花盆贴图读取已结束。'); }
        decoded.add(bitmap);
        reduced ||= !!preview.reduced;
        if (['image/png','image/jpeg','image/webp','image/avif'].includes(mime)) {
          sourceBlobs.set(bitmap,blob.type === mime ? blob : blob.slice(0,blob.size,mime));
        }
        onLoad(bitmap);
      }).catch(error => {
        failure ??= error;
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        onError(error);
      });
    }};
    return {name:'BranchForgeBonsaiImagePreview'};
  });
  return {
    get reduced() { return reduced; },
    check() { if (failure) throw failure; },
    finish(keep) {
      finished = true;
      for (const bitmap of decoded) if (!keep?.has(bitmap)) bitmap.close();
      decoded.clear();
    },
  };
}

export function originalPotImages(writer) {
  const processImage = writer.processImage.bind(writer);
  const sourceIndices = new WeakMap();
  writer.processImage = (image,format,flipY,mimeType) => {
    const blob = sourceBlobs.get(image);
    if (!blob || flipY || !writer.options.binary) return processImage(image,format,flipY,mimeType);
    if (sourceIndices.has(image)) return sourceIndices.get(image);
    const def = {mimeType:blob.type};
    const index = (writer.json.images ??= []).push(def) - 1;
    sourceIndices.set(image,index);
    writer.pending.push(writer.processBufferViewImage(blob).then(bufferView => { def.bufferView = bufferView; }));
    return index;
  };
  return {
    writeTexture(map,def) {
      const type = sourceBlobs.get(map.image)?.type;
      if (map.flipY || def.source === undefined || (type !== 'image/webp' && type !== 'image/avif')) return;
      const extension = type === 'image/webp' ? 'EXT_texture_webp' : 'EXT_texture_avif';
      (def.extensions ??= {})[extension] = {source:def.source};
      delete def.source;
      writer.extensionsUsed[extension] = writer.extensionsRequired[extension] = true;
    },
  };
}
