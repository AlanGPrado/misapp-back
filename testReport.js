// using native fetch

async function testReport() {
    const url = "http://localhost:8080/reportes";
    
    console.log("Submitting report 1...");
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parroquia_id: 1, tipo: 'cerrado' }) // Assuming id 1 exists
    });

    console.log("Submitting report 2...");
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parroquia_id: 1, tipo: 'cerrado' })
    });

    console.log("Submitting report 3 (Should Auto-Approve!)...");
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parroquia_id: 1, tipo: 'cerrado' })
    });

    const data = await res.json();
    console.log("Response:", data);
}

testReport();
