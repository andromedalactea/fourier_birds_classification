import os
import json
import time
import requests
from dotenv import load_dotenv

load_dotenv(override=True)

# 1. Configuración de parámetros para la API v3
API_URL = "https://xeno-canto.org/api/3/recordings"
API_KEY_ENV_VARS = ("XENO_CANTO_API_KEY", "XC_API_KEY")
REQUEST_TIMEOUT_SEC = 30
RETRY_DELAY_SEC = 10

QUERY = "lat:5.58-6.836 lon:-76.222--74.695 grp:birds"
LIMIT = 10  # Límite de descargas para la prueba

# Carpetas de destino
DATA_DIR = "xeno_canto_data"
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
METADATA_FILE = os.path.join(DATA_DIR, "metadata.json")

# Crear los directorios si no existen
os.makedirs(AUDIO_DIR, exist_ok=True)

def get_api_key():
    for var_name in API_KEY_ENV_VARS:
        value = os.getenv(var_name)
        if value:
            return var_name, value
    return None, None

def fetch_and_download():
    env_var_name, api_key = get_api_key()
    if not api_key:
        print("No API key found. Set one of these env vars:")
        print(f"  - {API_KEY_ENV_VARS[0]}")
        print(f"  - {API_KEY_ENV_VARS[1]}")
        print("The Xeno-Canto v3 API requires a key.")
        return "fatal"

    print(f"Buscando grabaciones en Xeno-Canto para: {QUERY}...")
    print(f"API endpoint: {API_URL}")
    print(f"Using API key from env var: {env_var_name}")
    
    # 2. Petición a la API para obtener la metadata
    params = {"query": QUERY, "key": api_key}
    print(f"Request params: query={params['query']}")
    try:
        response = requests.get(API_URL, params=params, timeout=REQUEST_TIMEOUT_SEC)
    except requests.RequestException as e:
        print(f"Request error while contacting API: {e}")
        return "retry"
    
    if response.status_code != 200:
        print(f"Error al conectar con la API: {response.status_code}")
        print(f"Final URL: {response.url}")
        response_snippet = response.text[:500].replace("\n", " ")
        print(f"Response snippet: {response_snippet}")
        if response.status_code in (401, 403, 404):
            return "fatal"
        return "retry"

    try:
        data = response.json()
    except ValueError:
        print("Could not parse JSON response from API.")
        print(f"Raw response snippet: {response.text[:500]}")
        return "retry"

    recordings = data.get("recordings", [])
    bird_recordings = [rec for rec in recordings if rec.get("grp") == "birds"]
    total_found = data.get("numRecordings", 0)
    
    print(f"Se encontraron {total_found} grabaciones en total.")
    print(f"Grabaciones marcadas como birds en esta página: {len(bird_recordings)}")
    print(f"Iniciando la descarga de las primeras {LIMIT} grabaciones para la prueba...\n")

    # Guardaremos la metadata de los archivos que realmente descarguemos
    downloaded_metadata = []

    # 3. Iterar y descargar solo los primeros 10
    for index, rec in enumerate(bird_recordings[:LIMIT]):
        rec_id = rec.get("id")
        file_url = rec.get("file")
        genus = rec.get("gen", "Unknown")
        species = rec.get("sp", "unknown")
        
        # Nombre del archivo basado en el ID y la especie
        filename = f"{rec_id}_{genus}_{species}.mp3"
        filepath = os.path.join(AUDIO_DIR, filename)
        
        print(f"[{index + 1}/{LIMIT}] Descargando ID {rec_id} ({genus} {species})...")
        
        try:
            # Petición para descargar el archivo de audio
            audio_response = requests.get(file_url, stream=True, timeout=REQUEST_TIMEOUT_SEC)
            if audio_response.status_code == 200:
                with open(filepath, 'wb') as f:
                    for chunk in audio_response.iter_content(chunk_size=1024):
                        if chunk:
                            f.write(chunk)
                
                # Añadir la ruta local del archivo a la metadata que guardaremos
                rec["local_path"] = filepath
                downloaded_metadata.append(rec)
            else:
                print(f"No se pudo descargar el audio para el ID {rec_id} (Status: {audio_response.status_code})")
        
        except requests.RequestException as e:
            print(f"Error descargando el ID {rec_id}: {e}")

    # 4. Guardar la metadata filtrada en un archivo JSON local
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(downloaded_metadata, f, ensure_ascii=False, indent=4)
    
    print("\nProceso terminado con éxito.")
    print(f"Audios guardados en: {AUDIO_DIR}/")
    print(f"Metadata guardada en: {METADATA_FILE}")
    return "success"

def run_until_success():
    attempt = 1
    while True:
        print(f"\n===== Attempt {attempt} =====")
        result = fetch_and_download()
        if result == "success":
            return
        if result == "fatal":
            print("Stopping retries because the error is not retryable.")
            return
        print(f"Retrying in {RETRY_DELAY_SEC} seconds...")
        time.sleep(RETRY_DELAY_SEC)
        attempt += 1

if __name__ == "__main__":
    run_until_success()