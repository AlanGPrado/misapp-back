import "dotenv/config";
import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const PLACES_API_KEY = process.env.PLACES_API_KEY;

app.use(cors());

async function getChurchData(churchName, address) {
    try {
        const query = encodeURIComponent(`${churchName} ${address}`);
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${PLACES_API_KEY}`;

        const { data } = await axios.get(searchUrl);

        if (data.results && data.results.length > 0) {
            const place = data.results[0];

            let image = null;

            if (place.photos && place.photos.length > 0) {
                const photoRef = place.photos[0].photo_reference;
                image = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${PLACES_API_KEY}`;
            }

            return {
                imagen: image,
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng
            };
        }

        return {
            imagen: null,
            lat: null,
            lng: null
        };

    } catch (error) {
        console.error(`Error fetching data for ${churchName}:`, error.message);
        return {
            imagen: null,
            lat: null,
            lng: null
        };
    }
}

app.get("/municipios", async (req, res) => {
    const { estado } = req.query;

    if (!estado) {
        return res.status(400).json({
            error: "estado es requerido"
        });
    }

    try {
        const url = `https://dondehaymisa.com/listaMunicipiosSearch/${estado}`;
        const { data } = await axios.get(url);
        res.json(data);
    } catch (error) {
        res.status(500).json({
            error: "error obteniendo municipios"
        });
    }
});

app.get("/misas", async (req, res) => {
    const { estado, municipio_id, page = 1 } = req.query;

    if (!estado || !municipio_id) {
        return res.status(400).json({
            error: "estado y municipio_id son requeridos"
        });
    }

    try {
        const url = `https://dondehaymisa.com/busqueda?diocese=&nombre=&estado=${estado}&municipio_id=${municipio_id}&tipo=&dia=&hora=&tipo_servicio=&formType=basic&page=${page}#parishResults`;

        const { data: html } = await axios.get(url);
        const $ = cheerio.load(html);
        const parroquias = [];

        $(".row[style*='margin-bottom:3%']").each((i, row) => {
            const $row = $(row);
            const $titleLink = $row.find("a:has(h3)");
            const churchName = $titleLink.find("h3").text().trim();

            if (!churchName) return;

            let link = $titleLink.attr("href") || "";
            if (link && !link.startsWith("http")) {
                link = "https://dondehaymisa.com" + link;
            }

            const churchData = {
                nombre: churchName,
                diocesis: "",
                direccion: "",
                telefono: "",
                fiesta_patronal: "",
                misas_hoy: "",
                link: link
            };

            $row.find("p.search-results").each((j, p) => {
                const $p = $(p);
                const $strong = $p.find("strong");
                const label = $strong.text().trim();

                // The value is usually in <em> or just after <strong>
                let value = $p.find("em").text().trim();
                if (!value && !label.includes("Teléfono")) {
                    value = $p.text().replace(label, "").trim();
                }

                if (label.includes("Diosesis") || label.includes("Diócesis")) {
                    churchData.diocesis = value;
                } else if (label.includes("Dirección")) {
                    churchData.direccion = value;
                } else if (label.includes("Teléfono")) {
                    churchData.telefono = $p.find("a").text().trim() || value;
                } else if (label.includes("Fiesta Patronal")) {
                    churchData.fiesta_patronal = value;
                } else if (label.includes("Misas Hoy")) {
                    churchData.misas_hoy = value;
                }
            });

            parroquias.push(churchData);
        });

        const parishesWithImages = await Promise.all(
            parroquias.map(async (church) => {
                const placeData = await getChurchData(church.nombre, church.direccion);

                return {
                    ...church,
                    imagen: placeData.imagen,
                    lat: placeData.lat,
                    lng: placeData.lng
                };
            })
        );

        res.json(parishesWithImages);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "error obteniendo parroquias"
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});