import { Router } from "express";
import {
  addPostComment,
  followUser,
  getFollowingActivityPosts,
  getFollowingCount,
  getPostComments,
  removePostReaction,
  searchUsers,
  setPostReaction,
  unfollowUser
} from "../data/store.js";

export const feedRouter = Router();

feedRouter.get("/friends/search", async (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q : "";
  const results = await searchUsers(query, request.userId!);
  response.json(results);
});

feedRouter.post("/friends/:targetUserId/follow", async (request, response) => {
  const result = await followUser(request.userId!, request.params.targetUserId);

  if ("error" in result) {
    response.status(400).json({ message: result.error });
    return;
  }

  response.json(result);
});

feedRouter.delete("/friends/:targetUserId/follow", async (request, response) => {
  const result = await unfollowUser(request.userId!, request.params.targetUserId);

  if ("error" in result) {
    response.status(400).json({ message: result.error });
    return;
  }

  response.json(result);
});

feedRouter.get("/", async (request, response) => {
  const posts = await getFollowingActivityPosts(request.userId!);
  response.json(posts);
});

feedRouter.get("/summary", async (request, response) => {
  response.json({ followingCount: await getFollowingCount(request.userId!) });
});

feedRouter.post("/posts/:postId/reactions", async (request, response) => {
  const reaction = typeof request.body?.reaction === "string" ? request.body.reaction : "";
  const visiblePost = await canCurrentUserViewPost(request.userId!, request.params.postId);

  if (!visiblePost) {
    response.status(404).json({ message: "Post not found." });
    return;
  }

  const result = await setPostReaction(request.userId!, request.params.postId, reaction);

  if ("error" in result) {
    response.status(400).json({ message: result.error });
    return;
  }

  response.json(result);
});

feedRouter.delete("/posts/:postId/reactions", async (request, response) => {
  const visiblePost = await canCurrentUserViewPost(request.userId!, request.params.postId);

  if (!visiblePost) {
    response.status(404).json({ message: "Post not found." });
    return;
  }

  response.json(await removePostReaction(request.userId!, request.params.postId));
});

feedRouter.get("/posts/:postId/comments", async (request, response) => {
  const visiblePost = await canCurrentUserViewPost(request.userId!, request.params.postId);

  if (!visiblePost) {
    response.status(404).json({ message: "Post not found." });
    return;
  }

  response.json(await getPostComments(request.params.postId));
});

feedRouter.post("/posts/:postId/comments", async (request, response) => {
  const text = typeof request.body?.text === "string" ? request.body.text : "";
  const visiblePost = await canCurrentUserViewPost(request.userId!, request.params.postId);

  if (!visiblePost) {
    response.status(404).json({ message: "Post not found." });
    return;
  }

  const result = await addPostComment(request.userId!, request.params.postId, text);

  if ("error" in result) {
    response.status(400).json({ message: result.error });
    return;
  }

  response.status(201).json(result);
});

async function canCurrentUserViewPost(userId: string, postId: string) {
  const posts = await getFollowingActivityPosts(userId);
  return posts.some((post) => post.id === postId);
}
