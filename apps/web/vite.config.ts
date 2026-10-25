import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({plugins:[react()],envDir:'../..',server:{port:5173,fs:{allow:['../..']}},define:{'import.meta.env.VITE_CONVEX_URL':JSON.stringify(loadEnv(mode,'../..','').CONVEX_URL || loadEnv(mode,'../..','').VITE_CONVEX_URL || '')},build:{chunkSizeWarningLimit:1200}}));
