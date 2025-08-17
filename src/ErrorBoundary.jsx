import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); this.setState({ info }); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:16, background:'#fff3cd', color:'#664d03', fontFamily:'system-ui'}}>
          <h3>Something went wrong rendering this page.</h3>
          <pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.error)}</pre>
          {this.state.info && <details><summary>Stack</summary><pre>{this.state.info.componentStack}</pre></details>}
        </div>
      );
    }
    return this.props.children;
  }
}
