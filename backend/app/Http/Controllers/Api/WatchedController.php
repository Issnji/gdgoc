<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreWatchedRequest;
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

    public function store(StoreWatchedRequest $request)
    {
        $exists = Review::where('user_id', auth('api')->id())
            ->where('movie_id', $request->movieId)
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'Film sudah tercatat sebagai watched.',
            ], 409);
        }
        $review = Review::create([
            'user_id' => auth('api')->id(),
            'movie_id' => $request->movieId,
            'rating' => $request->rating,
            'review' => $request->review,
        ]);

        return response()->json([
            'message' => 'Film berhasil dicatat sebagai watched.',
            'data' => $review,
        ], 201);
    }
}
