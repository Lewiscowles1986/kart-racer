import { Editor } from './editor';

const app = document.getElementById('app') as HTMLElement;
const editor = new Editor(app);

// Expose for tooling/debugging.
(window as any).__editor = editor;
