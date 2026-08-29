import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Track, terrainHeight, terrainNormal, sampleAtU as _unusedFreeHelper } from '../src/sim/trackSim';