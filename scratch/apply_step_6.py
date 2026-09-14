import re
import sys

def main():
    # 1. Update stateManager.js
    with open('modules/stateManager.js', 'r') as f:
        content = f.read()

    # Add offline support tracking to state initialization if missing
    # In calculateReadinessScore:
    content = re.sub(
        r'const hasTransport = \(tripData\.flights && tripData\.flights\.length > 0\) \? 1 : 0;',
        r'const hasTransport = ((tripData.flights && tripData.flights.length > 0) || (tripData.reservations && tripData.reservations.some(r => r.type === "Passagem Aérea" || r.type === "flight"))) ? 1 : 0;',
        content
    )
    content = re.sub(
        r'const hasHotel = \(\(tripData\.accommodations && tripData\.accommodations\.length > 0\) \|\| \(tripData\.infoHotel && tripData\.infoHotel !== \'A definir\' && tripData\.infoHotel !== \'Não definido\'\)\) \? 1 : 0;',
        r'const hasHotel = ((tripData.accommodations && tripData.accommodations.length > 0) || (tripData.reservations && tripData.reservations.some(r => r.type === "Hospedagem" || r.type === "accommodation")) || (tripData.infoHotel && tripData.infoHotel !== "A definir" && tripData.infoHotel !== "Não definido")) ? 1 : 0;',
        content
    )
    content = re.sub(
        r'if \(tripData\.documents && tripData\.documents\.length > 0\) {',
        r'if ((tripData.documents && tripData.documents.length > 0) || (tripData.reservations && tripData.reservations.length > 0)) {',
        content
    )

    with open('modules/stateManager.js', 'w') as f:
        f.write(content)


    # 2. Update app.js
    with open('app.js', 'r') as f:
        app_content = f.read()
    
    # Replace openDocsDB with standard indexedDB wrapper for offline docs caching
    app_content = app_content.replace(
        'const DB_NAME = "CoPilotoDocsDB";',
        'const DB_NAME = "CoPilotoOfflineDocsDB";\nconst STORE_NAME = "documents";'
    )

    app_content = app_content.replace(
        'async function saveDocumentFile(docId, base64Data) { return; }\nasync function getDocumentFile(docId) { return null; }\nasync function deleteDocumentFile(docId) { return; }',
        '''async function saveDocumentFile(docId, base64Data) {
  try {
    const db = await openDocsDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id: docId, data: base64Data });
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) { console.error("Error saving doc locally", e); }
}

async function getDocumentFile(docId) {
  try {
    const db = await openDocsDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(docId);
    return new Promise((res, rej) => { req.onsuccess = () => res(req.result ? req.result.data : null); req.onerror = rej; });
  } catch (e) { console.error("Error getting doc locally", e); return null; }
}

async function deleteDocumentFile(docId) {
  try {
    const db = await openDocsDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(docId);
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) { console.error("Error deleting doc locally", e); }
}'''
    )

    with open('app.js', 'w') as f:
        f.write(app_content)
        
    print("stateManager.js and app.js patched")

if __name__ == "__main__":
    main()
