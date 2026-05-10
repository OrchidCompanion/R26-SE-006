import 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';

import App from './App';

enableScreens();
AppRegistry.registerComponent(appName, () => App);