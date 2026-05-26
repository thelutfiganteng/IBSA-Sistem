-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create Profiles table (for users and Face Recognition)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'staff',
    face_embedding vector(128),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Commodity Stocks table (replaces local storage weighs/commodity status)
CREATE TABLE IF NOT EXISTS public.commodity_stocks (
    id BIGSERIAL PRIMARY KEY,
    region_id TEXT NOT NULL,
    commodity_id TEXT NOT NULL,
    supply_tons NUMERIC DEFAULT 0.0,
    demand_tons NUMERIC DEFAULT 0.0,
    stock_tons NUMERIC DEFAULT 0.0,
    avg_price NUMERIC DEFAULT 0.0,
    status_wilayah TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Weigh Records table
CREATE TABLE IF NOT EXISTS public.weigh_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal TIMESTAMP WITH TIME ZONE NOT NULL,
    komoditas_id TEXT NOT NULL,
    berat NUMERIC NOT NULL,
    harga NUMERIC NOT NULL,
    pasar_id TEXT NOT NULL,
    petugas TEXT NOT NULL,
    foto TEXT,
    lokasi TEXT,
    status_supply TEXT NOT NULL,
    ai_label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Face Matching RPC Function
CREATE OR REPLACE FUNCTION public.match_face(
    query_embedding vector(128),
    match_threshold double precision,
    match_count int
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    full_name TEXT,
    role TEXT,
    similarity double precision
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.username,
        p.full_name,
        p.role,
        1 - (p.face_embedding <=> query_embedding) AS similarity
    FROM public.profiles p
    WHERE 1 - (p.face_embedding <=> query_embedding) > match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;
