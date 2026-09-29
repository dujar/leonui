/* Study-only shim: expose React 19 (already in devDependencies) as browser globals
 * so the React condition's single-file pages need no build step and no network. */
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
(window as unknown as Record<string, unknown>).React = React;
(window as unknown as Record<string, unknown>).ReactDOM = ReactDOMClient;
