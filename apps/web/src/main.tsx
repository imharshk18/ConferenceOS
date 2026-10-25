import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import App from './GlobeApp';
const url=import.meta.env.VITE_CONVEX_URL;
const client=url?new ConvexReactClient(url):null;
createRoot(document.getElementById('root')!).render(client?<ConvexAuthProvider client={client}><App connected/></ConvexAuthProvider>:<App connected={false}/>);
