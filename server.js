const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const PORT = process.env.PORT || 1234;

// Create an HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server is running');
});

// Attach WebSocket server to the HTTP server
const wss = new WebSocket.Server({ server });

// Map to store document data
const clients = new Map();
const documents = new Map();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection established');

    // Integrate y-websocket connection setup
    setupWSConnection(ws, req, { gc: true });

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (error) {
            console.log('Invalid JSON message received, skipping...');
            return;
        }

        console.log('Message received:', data);

        // Handle different message types
        switch (data.type) {
            case 'JOIN_DOCUMENT':
                handleJoinDocument(ws, data);
                break;
            case 'REQUEST_ACCESS':
                handleRequestAccess(ws, data);
                break;
            case 'APPROVE_ACCESS':
                handleApproveAccess(ws, data);
                break;
            case 'DENY_ACCESS':
                handleDenyAccess(ws, data);
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        cleanupClient(ws);
    });
});

// Handle a client joining a document
function handleJoinDocument(ws, data) {
    const { documentId, username } = data;
    console.log(`${username} is trying to join document ${documentId}`);

    const existingDocument = documents.get(documentId);

    if (existingDocument) {
        if (existingDocument.owner === username) {
            console.log(`Owner ${username} rejoining document ${documentId}`);
            existingDocument.ownerconnection = ws; // Update the owner's connection
            ws.send(
                JSON.stringify({
                    type: 'JOINED_DOCUMENT',
                    message: `You have rejoined your document "${documentId}".`,
                })
            );
        } else {
            ws.send(
                JSON.stringify({
                    type: 'ERROR',
                    message: 'Document already exists and has a different owner.',
                })
            );
        }
    } else {
        // Create a new document if it doesn't exist
        documents.set(documentId, {
            title: documentId,
            owner: username,
            ownerconnection: ws,
        });

        ws.send(
            JSON.stringify({
                type: 'JOINED_DOCUMENT',
                message: `You have created and joined document "${documentId}".`,
            })
        );
    }
}

// Handle a request for access to a document
function handleRequestAccess(ws, data) {
    const { documentId, username } = data;
    const document = documents.get(documentId);

    if (document) {
        if (document.owner === username) {
            ws.send(
                JSON.stringify({
                    type: 'ERROR',
                    message: 'You are the owner of this document.',
                })
            );
            return;
        }

        const ownerWs = document.ownerconnection;

        if (ownerWs) {
            ownerWs.send(
                JSON.stringify({
                    type: 'ACCESS_REQUEST',
                    documentId,
                    username,
                })
            );
            const clientSet = clients.get(documentId) || new Set();
            clientSet.add(ws);
            clients.set(documentId, clientSet);

            ws.send(
                JSON.stringify({
                    type: 'ACCESS_REQUESTED',
                    message: 'Your access request has been sent to the owner.',
                })
            );
        } else {
            ws.send(
                JSON.stringify({
                    type: 'ERROR',
                    message: 'Document is not accessible.',
                })
            );
        }
    } else {
        ws.send(
            JSON.stringify({
                type: 'ERROR',
                message: 'Document not found.',
            })
        );
    }
}

// Handle approval of access request
function handleApproveAccess(ws, data) {
    const { content, documentId, username } = data;
    const document = documents.get(documentId);

    if (document) {
        const clientSet = clients.get(documentId) || new Set();

        clientSet.forEach((collaboratorWs) => {
            collaboratorWs.send(
                JSON.stringify({
                    type: 'ACCESS_GRANTED',
                    content,
                    message: `Your request to access the document "${document.title}" has been approved.`,
                })
            );
        });
    } else {
        ws.send(
            JSON.stringify({
                type: 'ERROR',
                message: 'Document not found.',
            })
        );
    }
}

// Handle denial of access request
function handleDenyAccess(ws, data) {
    const { documentId, username } = data;
    const document = documents.get(documentId);

    if (document) {
        const clientSet = clients.get(documentId) || new Set();

        clientSet.forEach((collaboratorWs) => {
            collaboratorWs.send(
                JSON.stringify({
                    type: 'ACCESS_DENIED',
                    message: `Your request to access the document "${document.title}" has been denied.`,
                })
            );
        });
    } else {
        ws.send(
            JSON.stringify({
                type: 'ERROR',
                message: 'Document not found.',
            })
        );
    }
}
server.listen(PORT, () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});