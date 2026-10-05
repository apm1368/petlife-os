import { ParseUUIDPipe, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { CurrentUser, OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CommunityPostService } from "./community-post.service";
import { CommunityReportService } from "./community-report.service";
import {
  CreateCommunityCommentDto,
  CreateCommunityPostDto,
  ListCommunityPostsQueryDto,
  RequestCommunityMediaUploadDto,
  SetCommunityReactionDto,
  SubmitCommunityReportDto,
} from "./dto/community.dto";
import { PaginationQueryDto } from "../../common/pagination/pagination.dto";

/**
 * spec: "Community browsing may be public where appropriate. Creating:
 * post, comment, reaction, report — requires authentication." GET handlers
 * carry no guard (mirroring PublicLostPetController/PublicAnimalSupport-
 * Controller's own "no guard by design"); OptionalSessionAuthGuard is used
 * only to personalize a GET response (the viewer's own reaction), never to
 * gate it.
 */
@Controller("community")
export class CommunityController {
  constructor(
    private readonly posts: CommunityPostService,
    private readonly reports: CommunityReportService,
  ) {}

  @Get("posts")
  @UseGuards(OptionalSessionAuthGuard)
  listPosts(@Query() query: ListCommunityPostsQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.posts.list(query, user?.id);
  }

  @Post("posts")
  @UseGuards(SessionAuthGuard)
  createPost(@CurrentUser() user: SessionUser, @Body() dto: CreateCommunityPostDto) {
    return this.posts.create(user.id, dto);
  }

  @Get("posts/:postId")
  @UseGuards(OptionalSessionAuthGuard)
  getPost(@Param("postId") postId: string, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.posts.get(postId, user?.id);
  }

  @Post("posts/upload-url")
  @UseGuards(SessionAuthGuard)
  requestMediaUpload(@CurrentUser() user: SessionUser, @Body() dto: RequestCommunityMediaUploadDto) {
    return this.posts.requestMediaUpload(user.id, dto.contentType, dto.fileSizeBytes);
  }

  @Get("posts/:postId/comments")
  @UseGuards(OptionalSessionAuthGuard)
  listComments(@Param("postId") postId: string, @Query() query: PaginationQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.posts.listComments(postId, query, user?.id);
  }

  @Post("posts/:postId/comments")
  @UseGuards(SessionAuthGuard)
  addComment(@Param("postId") postId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateCommunityCommentDto) {
    return this.posts.addComment(postId, user.id, dto);
  }

  @Put("posts/:postId/reactions")
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async setReaction(@Param("postId") postId: string, @CurrentUser() user: SessionUser, @Body() dto: SetCommunityReactionDto) {
    await this.posts.setReaction(postId, user.id, dto);
  }

  @Post("posts/:postId/save")
  @UseGuards(SessionAuthGuard)
  save(@Param("postId", ParseUUIDPipe) postId: string, @CurrentUser() user: SessionUser) {
    return this.posts.setSaved(postId, user.id, true);
  }

  @Delete("posts/:postId/save")
  @UseGuards(SessionAuthGuard)
  unsave(@Param("postId", ParseUUIDPipe) postId: string, @CurrentUser() user: SessionUser) {
    return this.posts.setSaved(postId, user.id, false);
  }

  @Get("saved-posts")
  @UseGuards(SessionAuthGuard)
  saved(@CurrentUser() user: SessionUser) {
    return this.posts.savedPosts(user.id);
  }

  @Delete("posts/:postId/reactions")
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeReaction(@Param("postId") postId: string, @CurrentUser() user: SessionUser) {
    await this.posts.removeReaction(postId, user.id);
  }

  @Post("posts/:postId/report")
  @UseGuards(SessionAuthGuard)
  reportPost(@Param("postId") postId: string, @CurrentUser() user: SessionUser, @Body() dto: SubmitCommunityReportDto) {
    return this.reports.reportPost(postId, user.id, dto);
  }

  @Post("comments/:commentId/report")
  @UseGuards(SessionAuthGuard)
  reportComment(@Param("commentId") commentId: string, @CurrentUser() user: SessionUser, @Body() dto: SubmitCommunityReportDto) {
    return this.reports.reportComment(commentId, user.id, dto);
  }
}
