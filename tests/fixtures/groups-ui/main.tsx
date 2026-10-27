import React from 'react';
import {createRoot} from 'react-dom/client';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ConferenceGroups} from '../../../apps/mobile/ConferenceGroups';
createRoot(document.getElementById('root')!).render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><ConferenceGroups authenticated connected/></SafeAreaProvider>);
