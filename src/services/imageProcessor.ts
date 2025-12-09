import { Difficulty, Region, VoxelCell } from '../types';

// Helper to convert RGB to Hex
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Helper for color similarity
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.sqrt(Math.pow(r2 - r1, 2) + Math.pow(g2 - g1, 2) + Math.pow(b2 - b1, 2));
}

export class ImageProcessor {
  static async process(
    areaUrl: string, 
    depthUrl: string, 
    difficulty: Difficulty,
    randomFactor: number = 1.0 // New parameter: 1.0 is standard, lower = more pieces, higher = fewer pieces
  ): Promise<{ regions: Region[], gridSize: { w: number, h: number } }> {
    
    // CONFIGURATION
    let resolution = 72; 
    let baseColorThreshold = 60; 
    let minRegionSize = 20;

    if (difficulty === 'easy') {
       resolution = 64; 
       baseColorThreshold = 85; 
       minRegionSize = 50;
    } else if (difficulty === 'medium') {
      resolution = 96;
      baseColorThreshold = 45; 
      minRegionSize = 30;
    } else if (difficulty === 'hard') {
      resolution = 128;
      baseColorThreshold = 25; 
      minRegionSize = 15;
    }

    // Apply Randomness to the Threshold
    // If randomFactor < 1, threshold drops -> colors distinguish more easily -> MORE pieces
    // If randomFactor > 1, threshold rises -> colors merge -> FEWER pieces
    const colorThreshold = baseColorThreshold * randomFactor;

    // Helper to load image
    const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image from ${src}. Check your network connection or CORS settings.`));
            img.src = src;
        });
    };

    try {
        const [areaImg, depthImg] = await Promise.all([
            loadImage(areaUrl),
            loadImage(depthUrl)
        ]);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error("No Canvas Context");

        // Calculate aspect ratio
        const aspect = areaImg.width > 0 ? areaImg.height / areaImg.width : 1;
        const width = resolution;
        const height = Math.floor(resolution * aspect);
        canvas.width = width;
        canvas.height = height;

        // 1. Process Area Map (Color)
        ctx.drawImage(areaImg, 0, 0, width, height);
        const areaData = ctx.getImageData(0, 0, width, height).data;

        // 2. Process Depth Map (Grayscale)
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(depthImg, 0, 0, width, height);
        const depthData = ctx.getImageData(0, 0, width, height).data;

        // Segmentation Logic
        const visited = new Uint8Array(width * height);
        const regions: Region[] = [];
        let regionCounter = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const visitedIdx = y * width + x;

                if (visited[visitedIdx]) continue;
                if (areaData[idx + 3] < 50) { visited[visitedIdx] = 1; continue; } // Skip transparent

                // Start new region
                const startR = areaData[idx];
                const startG = areaData[idx + 1];
                const startB = areaData[idx + 2];
                
                const regionId = `region_${regionCounter++}`;
                const cells: VoxelCell[] = [];
                let minX = x, maxX = x, minY = y, maxY = y;
                let sumX = 0, sumY = 0;

                const queue = [[x, y]];
                visited[visitedIdx] = 1;

                while (queue.length > 0) {
                    const [cx, cy] = queue.pop()!;
                    const currentIdx = (cy * width + cx) * 4;
                    
                    // Get depth for this cell
                    const depthVal = depthData[currentIdx]; 

                    // Get specific color for this cell (Texture Mapping)
                    const cellR = areaData[currentIdx];
                    const cellG = areaData[currentIdx + 1];
                    const cellB = areaData[currentIdx + 2];
                    const cellHex = rgbToHex(cellR, cellG, cellB);

                    cells.push({ x: cx, y: cy, depth: depthVal, color: cellHex });

                    // Stats
                    minX = Math.min(minX, cx);
                    maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy);
                    maxY = Math.max(maxY, cy);
                    sumX += cx;
                    sumY += cy;

                    // Neighbors
                    const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
                    for (const [nx, ny] of neighbors) {
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (!visited[nIdx]) {
                                const nImgIdx = nIdx * 4;
                                if (areaData[nImgIdx + 3] < 50) { visited[nIdx] = 1; continue; }

                                const nr = areaData[nImgIdx];
                                const ng = areaData[nImgIdx + 1];
                                const nb = areaData[nImgIdx + 2];

                                // Region Grouping Logic
                                if (colorDistance(startR, startG, startB, nr, ng, nb) < colorThreshold) {
                                    visited[nIdx] = 1;
                                    queue.push([nx, ny]);
                                }
                            }
                        }
                    }
                }

                if (cells.length > minRegionSize) {
                    regions.push({
                        id: regionId,
                        color: rgbToHex(startR, startG, startB), // Representative color
                        originalColor: { r: startR, g: startG, b: startB },
                        cells: cells,
                        center: { x: sumX / cells.length, y: sumY / cells.length },
                        bounds: { minX, maxX, minY, maxY }
                    });
                }
            }
        }

        return { regions, gridSize: { w: width, h: height } };

    } catch (e) {
        console.error("Processor Error", e);
        throw e;
    }
  }

  // Fallback generator
  static generateFallback(difficulty: Difficulty): { regions: Region[], gridSize: { w: number, h: number } } {
     const w = 40; const h = 40;
     const regions: Region[] = [];
     const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

     colors.forEach((c, i) => {
         const cells: VoxelCell[] = [];
         const startX = (i % 2) * (w/2);
         const startY = Math.floor(i / 2) * (h/2);
         let sumX=0, sumY=0;
         
         for(let y=startY; y<startY+(h/2); y++) {
             for(let x=startX; x<startX+(w/2); x++) {
                 cells.push({ x, y, depth: Math.random() * 255, color: c });
                 sumX+=x; sumY+=y;
             }
         }
         regions.push({
             id: `fb_${i}`,
             color: c,
             originalColor: { r: 100, g: 100, b: 100 },
             cells,
             center: { x: sumX/cells.length, y: sumY/cells.length },
             bounds: { minX:startX, maxX:startX+w/2, minY:startY, maxY:startY+h/2 }
         });
     });
     return { regions, gridSize: { w, h } };
  }
}