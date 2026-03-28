import axios from "axios";

export const getMunicipios = async (estado) => {
    const url = `https://dondehaymisa.com/listaMunicipiosSearch/${estado}`;
    try {
        const { data } = await axios.get(url);
        return data;
    } catch (error) {
        console.error("Municipios Service Error:", error.message);
        throw new Error("Unable to fetch municipios.");
    }
}
