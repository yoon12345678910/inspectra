import ReactDOM from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Options root element not found.');
}

ReactDOM.createRoot(root).render(<App />);

