from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Path as FastPath, Query
from fastapi.responses import JSONResponse
from pathlib import Path
from src.services.explore import MusicExplorer, get_supported_sources
from src.api.utils import resolve_explorer
from src.config import config

router = APIRouter(prefix="/api/explore", tags=["explore"])


@router.get("/sources")
def list_explore_sources():
    """Returns all registered external music exploration sources."""
    return {"sources": get_supported_sources()}


@router.get("/{source}/search")
def search_catalog(
    q: str = Query(..., min_length=1, description="Search query"),
    filter: Optional[str] = Query(
        default=None,
        description="Entity filter: 'song', 'album', 'artist' etc.",
    ),
    limit: int = Query(default=20, ge=1, le=100),
    ignore_spelling: bool = Query(default=False),
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Searches the specified remote source catalog."""
    try:
        filter_type = filter + "s" if filter else None
        results = explorer.search(
            query=q,
            filter_type=filter_type,
            limit=limit,
            ignore_spelling=ignore_spelling,
        )
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{source}/suggestions")
def get_search_suggestions(
    q: str = Query(..., min_length=1, description="Partial query for autocomplete"),
    detailed: bool = Query(default=False),
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Returns search autocomplete suggestions from the specified source."""
    try:
        suggestions = explorer.get_search_suggestions(query=q, detailed_runs=detailed)
        return JSONResponse(content=suggestions)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{source}/artists/{artist_id}")
def get_artist_details(
    artist_id: str,
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Fetches artist overview, top songs, albums, singles, and related artists."""
    try:
        artist = explorer.get_artist(artist_id)
        return JSONResponse(content=artist)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{source}/artists/{artist_id}/albums")
def get_artist_albums(
    artist_id: str,
    params: str = Query(..., description="Pagination/continuation params token"),
    limit: int = Query(default=100, ge=1, le=500),
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Fetches the full discography (albums or singles) for an artist."""
    try:
        albums = explorer.get_artist_albums(artist_id, params=params, limit=limit)
        return JSONResponse(content=albums)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{source}/albums/{album_id}")
def get_album_details(
    album_id: str,
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Fetches album metadata and ordered tracklist."""
    try:
        album = explorer.get_album(album_id)
        return JSONResponse(content=album)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{source}/moods")
def get_mood_categories(
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Returns mood and genre categories for browsing."""
    try:
        categories = explorer.get_mood_categories()
        return JSONResponse(content=categories)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{source}/moods/playlists")
def get_mood_playlists(
    params: str = Query(..., description="Category params token from /moods"),
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Returns curated playlists for a given mood or genre category."""
    try:
        playlists = explorer.get_mood_playlists(params=params)
        return JSONResponse(content=playlists)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{source}/playlists/{playlist_id}")
def get_playlist_details(
    playlist_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Resolves a remote playlist into metadata and track items."""
    try:
        playlist = explorer.get_playlist(playlist_id=playlist_id, limit=limit)
        return JSONResponse(content=playlist)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{source}/charts")
def get_charts(
    country: str = Query(
        default="ZZ",
        min_length=2,
        max_length=2,
        description="ISO 3166-1 Alpha-2 country code (or 'ZZ' for Global)",
    ),
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Fetches latest charts globally or per country."""
    try:
        charts = explorer.get_charts(country=country)
        return JSONResponse(content=charts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{source}/download/{track_id}")
def download_explore_track(
    track_id: str = FastPath(
        ..., description="Remote track identifier (e.g. YouTube video ID)"
    ),
    explorer: MusicExplorer = Depends(resolve_explorer),
    source: str = FastPath(..., description="Explore provider ID (e.g. 'ytm')"),
):
    """Downloads a remote track to the configured music directory.

    Once placed in the directory, the file watcher automatically ingests
    and syncs the track into the library database.
    """
    music_dir_str = config["music_dir"]
    music_dir = Path(music_dir_str).expanduser().resolve()

    if not music_dir.exists():
        music_dir.mkdir(parents=True, exist_ok=True)

    try:
        saved_file = explorer.download_track(
            video_id=track_id, destination_dir=music_dir
        )
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "source": source,
                "track_id": track_id,
                "filepath": str(saved_file),
            },
        )
    except Exception as e:
        print("error", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download track '{track_id}' from source '{source}': {e}",
        )
