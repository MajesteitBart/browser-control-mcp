"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPortInUse = isPortInUse;
const net = __importStar(require("net"));
function isPortInUse(port) {
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
        server.once('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                // If the error is because the port is already in use
                if (err.code === 'EADDRINUSE') {
                    resolve(true);
                }
                else if (err.code === 'EACCES') {
                    // Permission denied - treat as in use
                    console.error(`Permission denied for port ${port}, treating as in use`);
                    resolve(true);
                }
                else {
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
        }
        catch (err) {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.error(`Exception when checking port ${port}:`, err);
                resolve(true); // Assume in use if we can't check
            }
        }
    });
}
