const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const PORT = process.env.PORT || 1234;
const wss = new WebSocket.Server({
    port: PORT,
    host: '0.0.0.0', // Bind to all network interfaces (publicly accessible)
});

const clients = new Map(); // Stores clients for each document
const documents = new Map(); // Stores document metadata

wss.on('connection', (ws) => {
    console.log('New client connected');

    // Handle incoming messages from the client
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message); // Parse JSON
        } catch (error) {
            console.log('Not a valid JSON message, skipping...');
            return; // Ignore invalid JSON
        }

        console.log('Valid JSON received:', data);

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

    // Handle client disconnection
    ws.on('close', () => {
        console.log('Client disconnected');

        // Remove the client from the clients map
        for (const [documentId, clientSet] of clients.entries()) {
            if (clientSet.has(ws)) {
                clientSet.delete(ws);
                if (clientSet.size === 0) {
                    clients.delete(documentId);
                }
                break;
            }
        }

        // Handle document owner disconnection
        for (const [documentId, document] of documents.entries()) {
            if (document.ownerconnection === ws) {
                console.log(`Owner disconnected for document ${documentId}`);

                // Notify and disconnect all collaborators
                const collaborators = clients.get(documentId) || new Set();
                collaborators.forEach((collaboratorWs) => {
                    collaboratorWs.send(
                        JSON.stringify({
                            type: 'ERROR',
                            message: `The owner of the document  has disconnected. You have been removed from the session.`,
                        })
                    );
                    collaboratorWs.close();
                });

                // Clean up
                clients.delete(documentId);
                documents.delete(documentId);
                break;
            }
        }
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
wss.on('connection', (ws, req) => {
    setupWSConnection(ws, req, { gc: true });
});

console.log(`WebSocket server is running on port ${PORT}`);
