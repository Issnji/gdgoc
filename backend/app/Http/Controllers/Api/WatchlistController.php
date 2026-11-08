<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Movie;
use App\Models\Watchlist;
use Illuminate\Http\Request;
use Illuminate\Database\QueryException;

class WatchlistController extends Controller
{
    public function index(Request $request)
    {
        $items = Watchlist::with('movie')
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')->get();

        return response()->json($items->pluck('movie'));
    }

    public function store(Request $request)
    {
        $data = $request->validate(['movieId' => ['required', 'integer', 'exists:movies,id']]);
        $userId = $request->user()->id;

        if (Watchlist::where('user_id', $userId)->where('movie_id', $data['movieId'])->exists()) {
            return response()->json(['message' => 'Film sudah ada di watchlist.'], 409);
        }

        $item = Watchlist::create([
            'user_id' => $userId,
            'movie_id' => $data['movieId'],
            'created_at' => now(),
        ]);

        return response()->json(['message' => 'Film ditambahkan ke watchlist.', 'data' => $item->load('movie')], 201);
    }

    public function destroy(Request $request, int $movieId)
    {
        $deleted = Watchlist::where('user_id', $request->user()->id)
            ->where('movie_id', $movieId)->delete();

        if (!$deleted) {
            return response()->json(['message' => 'Film tidak ditemukan di watchlist.'], 404);
        }

        return response()->json(['message' => 'Film dihapus dari watchlist.']);
    }
}
