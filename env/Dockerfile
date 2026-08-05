# gdpval-video — Inspect GDPval sandbox + video-task overlay
# Base: UKGovernmentBEIS/inspect_evals gdpval (see SOURCE.md)
# Force AMD64 platform for maximum package compatibility
FROM --platform=linux/amd64 python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MPLBACKEND=Agg

# --- System runtime deps (Inspect GDPval + video QC) ---
# - ffmpeg + dev libs: moviepy/ffmpeg-python/pydub/av
# - mediainfo, sox: deliverable QC / audio trim
# - unzip, wget: Goodsin zip + stock downloads via proxy
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl wget git unzip \
    ffmpeg \
    mediainfo \
    sox libsox-fmt-all \
    libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev \
    libavfilter-dev libswscale-dev libswresample-dev \
    libsndfile1 \
    tesseract-ocr \
    poppler-utils \
    wkhtmltopdf \
    ghostscript \
    default-jre \
    graphviz libgraphviz-dev \
    libzbar0 \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libffi8 libxml2 libxslt1.1 \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
    fonts-dejavu-core \
    libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
    build-essential cmake pkg-config \
    libgeos-c1v5 libgeos-dev \
    libopenblas-dev liblapack-dev \
    libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir --upgrade pip setuptools wheel

# Prefer CPU wheels for PyTorch
RUN python -m pip config set global.index-url https://pypi.org/simple \
    && python -m pip config set global.extra-index-url https://download.pytorch.org/whl/cpu

WORKDIR /workspace
RUN mkdir -p deliverable_files reference_files scratch/downloads scratch/frames

COPY docker-requirements.txt /tmp/docker-requirements.txt
COPY video-requirements.txt /tmp/video-requirements.txt

RUN python -m pip install --no-cache-dir -r /tmp/docker-requirements.txt \
    && python -m pip install --no-cache-dir -r /tmp/video-requirements.txt \
    && python -m pip uninstall -y coverage pytest-cov \
    && python -m pip install --no-cache-dir --force-reinstall \
         'librosa==0.10.2' 'numpy==1.24.0'
# Drop coverage (numba 0.66 breaks on coverage.types.Tracer).
# Bump librosa: 0.8.1 uses removed np.complex under numpy 1.24.
# Keep numpy==1.24.0 so opencv-python 4.5.5 ABI still loads.

# Clean up build tools after installation (keep graphviz/ffmpeg/sox/mediainfo runtime)
RUN apt-get purge -y build-essential cmake pkg-config libgraphviz-dev \
    libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev \
    libavfilter-dev libswscale-dev libswresample-dev \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip /tmp/*

RUN useradd -ms /bin/bash appuser \
    && chown -R appuser:appuser /workspace

USER appuser
ENV HOME=/home/appuser

EXPOSE 8888
CMD ["/bin/bash"]
