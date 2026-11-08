<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Review;
use Illuminate\Http\Request;

class WatchedController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(
            Review::with('movie')
                ->where('user_id', $request->user()->id)
                ->orderByDesc('watched_at')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'movieId' => ['required', 'integer', 'exists:movies,id'],
            'rating' => ['required', 'integer', 'between:1,5'],
            'review' => ['nullable', 'string', 'max:5000'],
        ]);

        $userId = $request->user()->id;
        if (Review::where('user_id', $userId)->where('movie_id', $data['movieId'])->exists()) {
            return response()->json(['message' => 'Film ini sudah tercatat sebagai ditonton.'], 409);
        }

        $review = Review::create([
            'user_id' => $userId,
            'movie_id' => $data['movieId'],
            'rating' => $data['rating'],
            'review' => $data['review'] ?? null,
            'watched_at' => now(),
        ]);

        return response()->json(['message' => 'Riwayat tontonan berhasil disimpan.', 'data' => $review->load('movie')], 201);
    }
}
