/**
 * Entry point.
 *
 * Bootstrap's CSS is imported from the package rather than a CDN so the app
 * works offline and does not depend on a third-party host being reachable.
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/app.css';

import { start } from './ui/app.js';

start().catch((error) => {
  // A failure here means the UI never came up, so it has to be reported without
  // any of the app's own machinery.
  const box = document.createElement('div');
  box.className = 'alert alert-danger m-3';
  box.setAttribute('role', 'alert');
  box.textContent = `Keys from JSON could not start: ${error && error.message ? error.message : String(error)}`;
  document.body.prepend(box);
  throw error;
});
