import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { InstancedMesh, Object3D, Color, Vector3, Matrix4, Group } from 'three';
import { Region } from '../types';
import { useStore } from '../store';

// Constants
const CELL_SIZE = 1;

interface PuzzlePieceProps {
  region: Region;
  gridCenterOffset: { x: number, y: number };
  setControlsEnabled: (enabled: boolean) => void;
}

// ------ BIOME LOGIC ------
// Returns [minHeight, maxHeight] in voxel units
const getBiomeHeightRange = (colorHex: string, mapId: string | null): [number, number] => {
    const c = new Color(colorHex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const hue = hsl.h * 360; // 0-360

    if (mapId?.includes('mercury')) {
        // Mercury Logic
        // Beige/Orange (20-50) -> Plains
        if (hue >= 20 && hue <= 50) return [1, 3];
        // Blue/Green (160-260) -> Craters/Basins 
        if (hue >= 150 && hue <= 260) return [6, 8];
        // Rest
        return [2, 5];
    } 
    
    if (mapId?.includes('venus')) {
        // Venus Logic
        // Green (80-160)
        if (hue >= 80 && hue < 160) return [1, 3];
        // Blue (180-260)
        if (hue >= 180 && hue <= 260) return [2, 4];
        // Rest
        return [2, 8];
    }
    
    return [1, 4]; // Fallback
};

export const PuzzlePiece: React.FC<PuzzlePieceProps> = ({ region, gridCenterOffset, setControlsEnabled }) => {
  const meshRef = useRef<InstancedMesh>(null);
  const groupRef = useRef<Group>(null);
  
  const { 
      pieceStates, 
      selectedMapId, 
      dragStart, 
      dragMove, 
      dragEnd, 
      setHoveredPiece,
      hoveredPieceId,
      draggedPieceId,
      snapCandidateGroupId,
      isPreviewingSolved,
      displacementScale // Get scale from store
  } = useStore();
  
  const pieceState = pieceStates[region.id];
  const [isHovered, setIsHovered] = useState(false);
  const dummy = useMemo(() => new Object3D(), []);

  // Is this piece part of the group being dragged?
  const isDraggingGroup = draggedPieceId && pieceStates[draggedPieceId]?.groupId === pieceState?.groupId;
  
  // Is this piece part of the group we are about to snap to?
  const isSnapCandidate = snapCandidateGroupId && pieceState?.groupId === snapCandidateGroupId;

  const isActive = isDraggingGroup || isSnapCandidate;

  // Interaction State needed for raycasting logic
  const lastPointer = useRef(new Vector3());

  // Calculate target position for "Solved" state (used for preview)
  const solvedPos = useMemo(() => {
    const x = (region.center.x - gridCenterOffset.x) * CELL_SIZE;
    const z = (region.center.y - gridCenterOffset.y) * CELL_SIZE;
    return new Vector3(x, 0, z);
  }, [region, gridCenterOffset]);

  // Voxel Construction Data
  const constructionData = useMemo(() => {
     const instances: { x: number, y: number, z: number, color: string }[] = [];
     const [minH, maxH] = getBiomeHeightRange(region.color, selectedMapId);
     const range = maxH - minH;

     region.cells.forEach(cell => {
         // Depth 0-255 -> 0-1
         const normalizedDepth = cell.depth / 255;
         
         // SCALE APPLIED HERE
         // We scale the dynamic range of the height, keeping the base minH relatively stable
         // or we can scale the whole thing. Scaling addedHeight is safer for biome consistency.
         const addedHeight = Math.floor(normalizedDepth * range * displacementScale);
         const totalStack = Math.max(1, minH + addedHeight);
         
         const lx = (cell.x - region.center.x) * CELL_SIZE;
         const lz = (cell.y - region.center.y) * CELL_SIZE;
         
         for(let h = 0; h < totalStack; h++) {
             instances.push({
                 x: lx,
                 y: h * CELL_SIZE + (CELL_SIZE/2), 
                 z: lz,
                 color: cell.color 
             });
         }
     });
     return instances;
  }, [region, selectedMapId, displacementScale]); // Re-compute when scale changes

  // Bounding box for Hit Mesh
  const bounds = useMemo(() => {
      const width = (region.bounds.maxX - region.bounds.minX + 1) * CELL_SIZE;
      const depth = (region.bounds.maxY - region.bounds.minY + 1) * CELL_SIZE;
      const height = 12 * CELL_SIZE; // Increased bounds for higher displacements
      return [width, height, depth] as [number, number, number];
  }, [region]);

  // Update Geometry
  useEffect(() => {
    if (!meshRef.current) return;
    constructionData.forEach((data, i) => {
      dummy.position.set(data.x, data.y, data.z);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(i, new Color(data.color));
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [constructionData, dummy]);

  // Animation Loop for Smooth Movement
  useFrame(() => {
    if (!groupRef.current || !pieceState) return;

    let tx, ty, tz;

    if (isPreviewingSolved) {
        tx = solvedPos.x;
        ty = 0; // Solved is always on floor
        tz = solvedPos.z;
    } else {
        tx = pieceState.position[0];
        ty = pieceState.position[1];
        tz = pieceState.position[2];
    }
    
    // Lerp for smoothness
    const current = groupRef.current.position;
    const t = isDraggingGroup ? 0.8 : 0.15; 
    
    current.x += (tx - current.x) * t;
    current.y += (ty - current.y) * t;
    current.z += (tz - current.z) * t;
  });

  // --- INTERACTION HANDLERS ---

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (pieceState.isSolved || isPreviewingSolved) return;
    e.stopPropagation();
    lastPointer.current.copy(e.point);
    dragStart(region.id);
    setControlsEnabled(false);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (pieceState.isSolved || isPreviewingSolved) return;
    e.stopPropagation();
    dragEnd();
    setControlsEnabled(true);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (isDraggingGroup) {
      e.stopPropagation();
      const planeY = pieceState.position[1];
      const ray = e.ray;
      const denom = ray.direction.y;
      if (Math.abs(denom) > 0.0001) {
          const t = (planeY - ray.origin.y) / denom;
          const hit = new Vector3().copy(ray.origin).add(ray.direction.clone().multiplyScalar(t));
          
          if (lastPointer.current) {
              const deltaX = hit.x - lastPointer.current.x;
              const deltaZ = hit.z - lastPointer.current.z;
              
              if (Math.abs(deltaX) < 10 && Math.abs(deltaZ) < 10) { 
                  dragMove([deltaX, 0, deltaZ]);
              }
              lastPointer.current.copy(hit);
          } else {
              lastPointer.current.copy(hit);
          }
      }
    }
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (!draggedPieceId) {
          setIsHovered(true);
          setHoveredPiece(region.id);
          document.body.style.cursor = 'grab';
      }
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
      setIsHovered(false);
      setHoveredPiece(null);
      document.body.style.cursor = 'auto';
  };

  let emissiveColor = "#000000";
  let emissiveIntensity = 0;

  if (!pieceState.isSolved) {
      if (isDraggingGroup) {
          emissiveColor = "#f97316"; 
          emissiveIntensity = 0.5;
      } else if (isSnapCandidate) {
          emissiveColor = "#10b981"; 
          emissiveIntensity = 0.6;
      } else if (isHovered && !draggedPieceId) {
          emissiveColor = "#f97316";
          emissiveIntensity = 0.3;
      }
  }

  return (
    <group ref={groupRef}>
        <mesh 
            visible={false}
            position={[0, bounds[1]/2, 0]} 
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerMove={handlePointerMove}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
        >
            <boxGeometry args={[bounds[0], bounds[1], bounds[2]]} />
            <meshBasicMaterial color="red" wireframe />
        </mesh>

        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, constructionData.length]}
          frustumCulled={false}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial 
            roughness={0.8} 
            metalness={0.1}
            flatShading
            emissive={emissiveColor}
            emissiveIntensity={emissiveIntensity}
          />
        </instancedMesh>
    </group>
  );
};
