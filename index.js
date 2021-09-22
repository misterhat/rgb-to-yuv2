const fs = require('fs').promises;
const wrap = require('word-wrap');
const { createCanvas, loadImage } = require('canvas');
const { basename, extname } = require('path');

const headerTemplate = `
#ifndef _$name_yuv
#define _$name_yuv

#include <stdint.h>

int $name_yuv_width = $width;
int $name_yuv_height = $height;
extern uint8_t $name_yuv[$area];

#endif`.trim();

const template = `
#include "$name_yuv.h"

uint8_t $name_yuv[] = {
$bytes
};`.trim();

function clip(x) {
    return x > 255 ? 255 : x < 0 ? 0 : x;
}

function rgb2y(r, g, b) {
    return clip(((66 * r + 129 * g + 25 * b + 128) >> 8) + 16);
}

function rgb2u(r, g, b) {
    return clip(((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128);
}

function rgb2v(r, g, b) {
    return clip(((112 * r - 94 * g - 18 * b + 128) >> 8) + 128);
}

function convertImage(image) {
    const canvas = createCanvas(image.width, image.height);
    canvas.width = image.width;
    canvas.height = image.height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, image.width, image.height);
    const pixels = imageData.data;

    const bytes = new Uint8Array(image.width * image.height);
    let index = 0;
    let yuvIndex = 0;

    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x += 2) {
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            const r2 = pixels[index + 4];
            const g2 = pixels[index + 5];
            const b2 = pixels[index + 6];

            index += 8;

            const y1 = rgb2y(r, g, b);
            const y2 = rgb2y(r2, g2, b2);
            const u = ((rgb2u(r, g, b) + rgb2u(r2, g2, b2)) / 2) | 0;
            const v = ((rgb2v(r, g, b) + rgb2v(r2, g2, b2)) / 2) | 0;

            bytes[yuvIndex] = y1;
            bytes[yuvIndex + 2] = y2;
            bytes[yuvIndex + 1] = u;
            bytes[yuvIndex + 3] = v;
            yuvIndex += 4;
        }
    }

    return Array.from(bytes)
        .map((b) => `0x${b.toString(16).padStart(2, 0)}`)
        .join(', ');
}

(async () => {
    const fileName = process.argv[2];
    const outputName = basename(fileName, extname(fileName));
    const image = await loadImage(fileName);
    const byteArray = wrap(convertImage(image), { width: 76, indent: '    ' });

    await fs.writeFile(
        `${outputName}_yuv.h`,
        headerTemplate
            .replace(/\$name/g, outputName)
            .replace('$width', image.width)
            .replace('$height', image.height)
            .replace('$area', image.width * image.height)
    );

    await fs.writeFile(
        `${outputName}_yuv.c`,
        template
            .replace(/\$name/g, outputName)
            .replace('$bytes', byteArray)
    );
})();
