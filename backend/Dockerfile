# Menggunakan image Python resmi berbasis Debian (slim)
FROM python:3.12-slim

# Menghindari prompt interaktif saat instalasi apt
ENV DEBIAN_FRONTEND=noninteractive

# Menentukan direktori kerja di dalam container
WORKDIR /app

# Menginstal dependensi sistem yang dibutuhkan oleh dlib & face_recognition
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgtk-3-dev \
    && rm -rf /var/lib/apt/lists/*

# Menyalin file requirements terlebih dahulu (untuk memanfaatkan Docker cache)
COPY requirements.txt .

# Menginstal dependensi Python
RUN pip install --no-cache-dir -r requirements.txt

# Menyalin seluruh kode backend ke dalam container
COPY . .

# Mengekspos port 8000
EXPOSE 8000

# Menjalankan server FastAPI menggunakan Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
