import * as net from 'net';

export function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      let resolved = false;
      
      // Set a timeout to avoid hanging on port checks
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          server.close();
          console.error(`Port check timeout for port ${port}, assuming in use`);
          resolve(true);
        }
      }, 2000); // 2 second timeout
      
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          
          // If the error is because the port is already in use
          if (err.code === 'EADDRINUSE') {
            resolve(true);
          } else if (err.code === 'EACCES') {
            // Permission denied - treat as in use
            console.error(`Permission denied for port ${port}, treating as in use`);
            resolve(true);
          } else {
            // Some other error occurred - log it but assume port is available
            console.error(`Error checking port ${port}:`, err.message);
            resolve(false);
          }
        }
      });
      
      server.once('listening', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          
          // If we get here, the port is free
          // Close the server and resolve with false (port not in use)
          server.close(() => {
            resolve(false);
          });
        }
      });
      
      // Try to listen on the port (bind to localhost)
      try {
        server.listen(port, 'localhost');
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error(`Exception when checking port ${port}:`, err);
          resolve(true); // Assume in use if we can't check
        }
      }
    });
  }